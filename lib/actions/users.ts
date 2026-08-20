import "server-only";

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

/** Returns the app-schema User row for the current session, creating it on first login (architecture.md §7.2). */
export async function getOrCreateUser() {
  const supabase = await createClient();
  const {
    data: { user: supabaseUser },
  } = await supabase.auth.getUser();

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
}
