import { NextResponse, type NextRequest } from "next/server";

import { getNearbyParks } from "@/lib/actions/parks";
import { getOrCreateUser } from "@/lib/actions/users";
import type { DogPreferences } from "@/lib/dog-attributes";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  const radiusMiles = Number(searchParams.get("radiusMiles") ?? "3");
  const dogId = searchParams.get("dogId");

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  let viewingDog: { id: string; preferences: DogPreferences } | null = null;
  if (dogId) {
    const dog = await prisma.dog.findUnique({ where: { id: dogId } });
    if (dog && dog.ownerId === user.id) {
      viewingDog = { id: dog.id, preferences: dog.preferences as DogPreferences };
    }
  }

  try {
    const parks = await getNearbyParks(lat, lng, radiusMiles, viewingDog);
    return NextResponse.json({ parks });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch parks" },
      { status: 502 }
    );
  }
}
