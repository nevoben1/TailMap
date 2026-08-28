import "server-only";

import { cache } from "react";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import type { User as SupabaseUser } from "@supabase/supabase-js";

function deriveName(supabaseUser: SupabaseUser): string {
  const metaName =
    (supabaseUser.user_metadata?.full_name as string | undefined) ??
    (supabaseUser.user_metadata?.name as string | undefined);
  return metaName ?? supabaseUser.email?.split("@")[0] ?? "Dog owner";
}

/**
 * The raw Supabase auth session check — nothing else. Cached per-request so
 * every other helper below (and any page calling this directly) shares one
 * network round-trip to Supabase Auth instead of each doing their own.
 */
export const getSupabaseUser = cache(async (): Promise<SupabaseUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * Lightweight session check — just the id. For call sites that only need to
 * know "who" (rate-limiting, ownership checks in mutations), not the app User row.
 *
 * Uses getClaims() rather than getUser(): when the project signs JWTs with an
 * asymmetric key it verifies the token locally (one cached JWKS fetch for the
 * whole process) instead of a round trip to Supabase Auth on every call. On a
 * legacy HS256 project it transparently falls back to getUser(). Cached
 * per-request like the helpers above.
 */
export const getSessionUserId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || typeof sub !== "string") return null;
  return sub;
});

/**
 * Returns the app-schema User row for the current session, creating it on first
 * login (architecture.md §7.2). Cached per-request like getSupabaseUser above.
 *
 * A page that also needs its own data (e.g. this user's dogs) should call
 * getSupabaseUser() itself to get the id immediately, then run its own query
 * in Promise.all alongside this function rather than awaiting this first —
 * the data query only needs the id, not the upserted row, so there's no need
 * to block on the upsert. (This was the second half of a real slowness fix:
 * the auth-check-then-upsert-then-query chain was fully sequential when two
 * of those three steps don't actually depend on each other.)
 */
export const getOrCreateUser = cache(async () => {
  const supabaseUser = await getSupabaseUser();
  if (!supabaseUser) return null;

  const name = deriveName(supabaseUser);

  try {
    return await prisma.user.upsert({
      where: { id: supabaseUser.id },
      update: {},
      create: {
        id: supabaseUser.id,
        name,
        email: supabaseUser.email ?? "",
        avatarInitial: name.charAt(0).toUpperCase(),
      },
    });
  } catch (error) {
    // Concurrent first-login requests can both miss the row and race the create
    // (Next dev double-invokes server components; two upserts can interleave).
    // Whichever loses the race just re-reads the row the winner created.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.user.findUnique({ where: { id: supabaseUser.id } });
      if (existing) return existing;
    }
    throw error;
  }
});
