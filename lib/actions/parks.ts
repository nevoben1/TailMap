import "server-only";

import { computeParkGrade, describeCheckedInDogs, type DogMatch, type ParkGrade } from "@/lib/grading";
import { haversineMiles, milesToMeters } from "@/lib/geo";
import { searchNearbyParks } from "@/lib/places";
import { prisma } from "@/lib/prisma";
import type { DogPreferences } from "@/lib/dog-attributes";

const CACHE_TTL_HOURS = 24;

export type NearbyPark = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  photoRef: string | null;
  distanceMiles: number;
  checkedInCount: number;
  grade: ParkGrade | null;
  checkedInDogs: DogMatch[];
};

/**
 * architecture.md §6 — cache-first park lookup. Checks the Park table for rows
 * within the radius newer than the TTL; on a miss, calls Places API (New) and
 * upserts results before returning. Attaches a live-computed grade per
 * architecture.md §4 when a viewing dog is given.
 */
export async function getNearbyParks(
  lat: number,
  lng: number,
  radiusMiles: number,
  viewingDog?: { id: string; preferences: DogPreferences } | null
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

  const now = new Date();
  const parkIds = withinRadius.map((p) => p.id);
  const activeCheckIns = await prisma.checkIn.findMany({
    where: { parkId: { in: parkIds }, endedAt: null, expiresAt: { gt: now } },
    include: { dog: true },
  });

  const checkInsByPark = new Map<string, typeof activeCheckIns>();
  for (const checkIn of activeCheckIns) {
    const list = checkInsByPark.get(checkIn.parkId) ?? [];
    list.push(checkIn);
    checkInsByPark.set(checkIn.parkId, list);
  }

  return withinRadius
    .map((park) => {
      const checkIns = checkInsByPark.get(park.id) ?? [];
      const checkedInAttrs = checkIns.map((c) => ({
        id: c.dog.id,
        name: c.dog.name,
        breed: c.dog.breed,
        size: c.dog.size,
        color: c.dog.color,
        age: c.dog.age,
        energy: c.dog.energy,
        gender: c.dog.gender,
      }));
      const grade = viewingDog
        ? computeParkGrade(viewingDog.id, viewingDog.preferences, checkedInAttrs)
        : null;
      const checkedInDogs = viewingDog
        ? describeCheckedInDogs(viewingDog.id, viewingDog.preferences, checkedInAttrs)
        : [];

      return {
        id: park.id,
        name: park.name,
        lat: park.lat,
        lng: park.lng,
        address: park.address,
        photoRef: park.photoRef,
        distanceMiles: Math.round(haversineMiles(lat, lng, park.lat, park.lng) * 10) / 10,
        checkedInCount: checkIns.length,
        grade,
        checkedInDogs,
      };
    })
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
}
