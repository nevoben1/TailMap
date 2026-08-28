import { redirect } from "next/navigation";

import { getOrCreateUser, getSupabaseUser } from "@/lib/actions/users";
import type { DogPreferences } from "@/lib/dog-attributes";
import { prisma } from "@/lib/prisma";

import { MapClient } from "./map-client";

export default async function MapPage() {
  const supabaseUser = await getSupabaseUser();
  if (!supabaseUser) redirect("/login");

  const [, dogs, settings] = await Promise.all([
    getOrCreateUser(),
    prisma.dog.findMany({
      where: { ownerId: supabaseUser.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.settings.findUnique({ where: { userId: supabaseUser.id } }),
  ]);

  if (dogs.length === 0) redirect("/dogs?dog=new");

  return (
    <MapClient
      dogs={dogs.map((d) => ({
        id: d.id,
        name: d.name,
        breed: d.breed,
        preferences: d.preferences as DogPreferences,
      }))}
      radiusMiles={settings?.discoveryRadius ?? 3}
      distanceUnit={settings?.distanceUnit === "km" ? "km" : "mi"}
    />
  );
}
