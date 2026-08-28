import "server-only";

import type { Park } from "@prisma/client";

import { seedDemoLiveness } from "@/lib/demo-seed";
import { haversineMiles, milesToMeters } from "@/lib/geo";
import type { CheckedInDog } from "@/lib/grading";
import { searchNearbyParks } from "@/lib/places";
import { prisma } from "@/lib/prisma";

const CACHE_TTL_HOURS = 24;

/**
 * Grading is intentionally NOT computed here — it's a pure, cheap function
 * (lib/grading.ts) of "which dog is checked in" + "the viewer's preferences",
 * and the viewer can switch dogs without the underlying park/check-in data
 * changing at all. Returning the raw checked-in dogs and letting the client
 * grade locally means switching dogs recomputes instantly with zero network
 * round-trip, instead of re-fetching everything just to re-run a calculation
 * that didn't need new data.
 */
export type NearbyPark = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  photoRef: string | null;
  distanceMiles: number | null;
  checkedInDogs: CheckedInDog[];
  isFavorited: boolean;
};

type ActiveCheckIn = Awaited<ReturnType<typeof fetchActiveCheckIns>>[number];

function fetchActiveCheckIns(parkIds: string[], now: Date) {
  return prisma.checkIn.findMany({
    where: { parkId: { in: parkIds }, endedAt: null, expiresAt: { gt: now } },
    include: { dog: true },
  });
}

/** Pure — no I/O. Shared by nearby search and the Saved list once each has fetched its own check-ins/favorites. */
function buildNearbyParks(
  parks: Park[],
  activeCheckIns: ActiveCheckIn[],
  favoritedIds: Set<string>,
  origin: { lat: number; lng: number } | null
): NearbyPark[] {
  const checkInsByPark = new Map<string, ActiveCheckIn[]>();
  for (const checkIn of activeCheckIns) {
    const list = checkInsByPark.get(checkIn.parkId) ?? [];
    list.push(checkIn);
    checkInsByPark.set(checkIn.parkId, list);
  }

  return parks.map((park) => {
    const checkIns = checkInsByPark.get(park.id) ?? [];
    const checkedInDogs: CheckedInDog[] = checkIns.map((c) => ({
      id: c.dog.id,
      name: c.dog.name,
      breed: c.dog.breed,
      size: c.dog.size,
      color: c.dog.color,
      age: c.dog.age,
      energy: c.dog.energy,
      gender: c.dog.gender,
    }));

    return {
      id: park.id,
      name: park.name,
      lat: park.lat,
      lng: park.lng,
      address: park.address,
      photoRef: park.photoRef,
      distanceMiles: origin
        ? Math.round(haversineMiles(origin.lat, origin.lng, park.lat, park.lng) * 10) / 10
        : null,
      checkedInDogs,
      isFavorited: favoritedIds.has(park.id),
    };
  });
}

/**
 * architecture.md §6 — cache-first park lookup. Checks the Park table for rows
 * within the radius newer than the TTL; on a miss, calls Places API (New) and
 * upserts results before returning.
 */
export async function getNearbyParks(
  lat: number,
  lng: number,
  radiusMiles: number,
  userId: string | null
): Promise<NearbyPark[]> {
  const cutoff = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000);

  let cached = await prisma.park.findMany({
    where: { source: "external_api", cachedAt: { gt: cutoff } },
  });
  let withinRadius = cached.filter(
    (p) => haversineMiles(lat, lng, p.lat, p.lng) <= radiusMiles
  );

  if (withinRadius.length === 0) {
    const results = await searchNearbyParks(lat, lng, milesToMeters(radiusMiles));

    await Promise.all(
      results.map((r) =>
        prisma.park.upsert({
          where: { externalPlaceId: r.externalPlaceId },
          update: {
            name: r.name,
            lat: r.lat,
            lng: r.lng,
            address: r.address,
            photoRef: r.photoRef,
            cachedAt: new Date(),
          },
          create: {
            externalPlaceId: r.externalPlaceId,
            name: r.name,
            lat: r.lat,
            lng: r.lng,
            address: r.address,
            photoRef: r.photoRef,
            source: "external_api",
          },
        })
      )
    );

    cached = await prisma.park.findMany({
      where: { source: "external_api", cachedAt: { gt: cutoff } },
    });
    withinRadius = cached.filter(
      (p) => haversineMiles(lat, lng, p.lat, p.lng) <= radiusMiles
    );
  }

  const parkIds = withinRadius.map((p) => p.id);
  const now = new Date();

  const [activeCheckIns, favorites] = await Promise.all([
    fetchActiveCheckIns(parkIds, now),
    userId
      ? prisma.favorite.findMany({ where: { userId, parkId: { in: parkIds } } })
      : Promise.resolve([]),
  ]);

  // Demo seeding reuses the occupancy data we already fetched instead of
  // re-querying it — and we only pay for a re-fetch of check-ins if seeding
  // actually wrote something (the common steady-state case writes nothing).
  const occupiedParkIds = new Set(activeCheckIns.map((c) => c.parkId));
  const didSeed = await seedDemoLiveness(parkIds, occupiedParkIds, lat, lng);
  const finalCheckIns = didSeed ? await fetchActiveCheckIns(parkIds, new Date()) : activeCheckIns;

  const favoritedIds = new Set(favorites.map((f) => f.parkId));
  const result = buildNearbyParks(withinRadius, finalCheckIns, favoritedIds, { lat, lng });
  return result.sort((a, b) => (a.distanceMiles ?? 0) - (b.distanceMiles ?? 0));
}

/** specs.md §8 Map — "Saved" tab: favorited parks regardless of current search radius. */
export async function getFavoritedParks(
  userId: string,
  origin: { lat: number; lng: number } | null
): Promise<NearbyPark[]> {
  const favorites = await prisma.favorite.findMany({
    where: { userId },
    include: { park: true },
  });
  const parks = favorites.map((f) => f.park);
  const parkIds = parks.map((p) => p.id);

  const activeCheckIns = await fetchActiveCheckIns(parkIds, new Date());
  // Every park here is, by construction, favorited by this user.
  const result = buildNearbyParks(parks, activeCheckIns, new Set(parkIds), origin);
  return result.sort((a, b) => (a.distanceMiles ?? 0) - (b.distanceMiles ?? 0));
}
