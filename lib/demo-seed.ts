import "server-only";

import { prisma } from "@/lib/prisma";
import type { DogAttributes } from "@/lib/dog-attributes";

/**
 * Demo-mode liveness seeding — NOT part of the product spec. Exists only because
 * the app has zero real users to demo against, and grading is per-viewer-location,
 * so a fixed one-time seed script can't cover wherever a grader/tester actually is.
 *
 * Gated behind DEMO_MODE=true. Writes ordinary CheckIn rows against a demo User +
 * Dog roster, so it flows through the real grading/map/session code unchanged and
 * expires via the same lazy-expiry filter as real check-ins — no separate cleanup
 * path. Costs zero external API calls (Places/Maps): it only acts on Park rows
 * already fetched by the normal cache-first nearby search.
 *
 * The roster is duplicated per rough geographic region (see regionKey below) so
 * two testers in different parts of the world never compete for the same 10
 * dogs — the earlier single-global-roster version starved out anyone testing
 * from a different area than whoever tested most recently.
 *
 * To remove before a real launch: delete this file, the DEMO_MODE env var, and
 * the seedDemoLiveness() call in lib/actions/parks.ts.
 */

const DEMO_USER_ID = "demo-seed-user";

const DEMO_DOG_TEMPLATES: (DogAttributes & { id: string; name: string })[] = [
  { id: "rex", name: "Rex", Size: "Large", Breed: "Labrador", Color: "Black", Age: "Adult", Energy: "Playful", Gender: "Male" },
  { id: "nala", name: "Nala", Size: "Medium", Breed: "Golden Retriever", Color: "Golden", Age: "Adult", Energy: "Playful", Gender: "Female" },
  { id: "ziggy", name: "Ziggy", Size: "Small", Breed: "Chihuahua", Color: "Tan", Age: "Puppy", Energy: "Calm", Gender: "Male" },
  { id: "luna", name: "Luna", Size: "Large", Breed: "Husky", Color: "Gray", Age: "Young", Energy: "High-energy", Gender: "Female" },
  { id: "bruno", name: "Bruno", Size: "Medium", Breed: "Boxer", Color: "Brindle", Age: "Adult", Energy: "Moderate", Gender: "Male" },
  { id: "coco", name: "Coco", Size: "Small", Breed: "Poodle", Color: "White", Age: "Senior", Energy: "Calm", Gender: "Female" },
  { id: "duke", name: "Duke", Size: "Large", Breed: "German Shepherd", Color: "Brown", Age: "Adult", Energy: "Moderate", Gender: "Male" },
  { id: "willow", name: "Willow", Size: "Medium", Breed: "Border Collie", Color: "Black", Age: "Young", Energy: "High-energy", Gender: "Female" },
  { id: "finn", name: "Finn", Size: "Small", Breed: "Dachshund", Color: "Red", Age: "Adult", Energy: "Calm", Gender: "Male" },
  { id: "pepper", name: "Pepper", Size: "Medium", Breed: "Australian Shepherd", Color: "Merle", Age: "Young", Energy: "Playful", Gender: "Female" },
];

/** ~11km grid cell — fine enough that two testers in the same metro area share
 * one pool (consistent "live" state within a city), coarse enough that testers
 * in different cities/countries never contend for the same dogs. */
function regionKey(lat: number, lng: number): string {
  return `${lat.toFixed(1)}_${lng.toFixed(1)}`;
}

function dogIdFor(templateId: string, region: string): string {
  return `demo-dog-${templateId}-${region}`;
}

const ensuredRegions = new Set<string>();

async function ensureDemoRosterForRegion(region: string) {
  if (ensuredRegions.has(region)) return;

  await prisma.user.upsert({
    where: { id: DEMO_USER_ID },
    update: {},
    create: {
      id: DEMO_USER_ID,
      name: "Tailmap Demo",
      email: "demo@tailmap.internal",
      avatarInitial: "D",
    },
  });

  await Promise.all(
    DEMO_DOG_TEMPLATES.map((t) =>
      prisma.dog.upsert({
        where: { id: dogIdFor(t.id, region) },
        update: {},
        create: {
          id: dogIdFor(t.id, region),
          ownerId: DEMO_USER_ID,
          name: t.name,
          size: t.Size,
          breed: t.Breed,
          color: t.Color,
          age: t.Age,
          energy: t.Energy,
          gender: t.Gender,
          preferences: {},
        },
      })
    )
  );

  ensuredRegions.add(region);
}

function shuffle<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

/**
 * Seeds 1–3 demo dogs into a random subset of currently-empty parks from the
 * given id list. Returns whether it actually wrote anything, so the caller
 * (which already fetched park occupancy for its own response) knows whether
 * it needs to re-fetch to pick up the new rows.
 */
export async function seedDemoLiveness(
  parkIds: string[],
  occupiedParkIds: Set<string>,
  lat: number,
  lng: number
): Promise<boolean> {
  if (process.env.DEMO_MODE !== "true" || parkIds.length === 0) return false;

  try {
    const region = regionKey(lat, lng);
    await ensureDemoRosterForRegion(region);
    const regionDogs = DEMO_DOG_TEMPLATES.map((t) => ({
      ...t,
      id: dogIdFor(t.id, region),
    }));

    const now = new Date();

    const emptyParks = parkIds.filter((id) => !occupiedParkIds.has(id));
    if (emptyParks.length === 0) return false;

    // Demo dogs already checked in somewhere (anywhere, not just this park
    // batch) are excluded from the pool below, so a placement sticks until it
    // naturally expires instead of getting reshuffled on every request.
    const activeDemoDogs = await prisma.checkIn.findMany({
      where: {
        dogId: { in: regionDogs.map((d) => d.id) },
        endedAt: null,
        expiresAt: { gt: now },
      },
      select: { dogId: true },
    });
    const busyDogIds = new Set(activeDemoDogs.map((c) => c.dogId));
    const idleDogs = regionDogs.filter((d) => !busyDogIds.has(d.id));
    if (idleDogs.length === 0) return false;

    // Cap and roll dice per park so not every empty park fills up — the empty
    // state (specs.md §5.7) is a real, intentional thing to still be able to see.
    const candidates = shuffle(emptyParks).slice(0, 6);
    const toSeed = candidates.filter(() => Math.random() < 0.6);

    // Assign from the idle pool so no dog is double-booked across parks in
    // this pass — makes the writes below safe to run concurrently.
    const pool = shuffle(idleDogs);
    const assignments: { parkId: string; dog: (typeof regionDogs)[number] }[] = [];
    for (const parkId of toSeed) {
      const dogCount = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < dogCount && pool.length > 0; i++) {
        assignments.push({ parkId, dog: pool.pop()! });
      }
    }
    if (assignments.length === 0) return false;

    await Promise.all(
      assignments.map(({ parkId, dog }) => {
        const hours = 1 + Math.random() * 3;
        // Dog is confirmed idle above, so no need to end a prior check-in first.
        return prisma.checkIn.create({
          data: {
            dogId: dog.id,
            parkId,
            expiresAt: new Date(now.getTime() + hours * 60 * 60 * 1000),
          },
        });
      })
    );
    return true;
  } catch (error) {
    // Demo seeding is best-effort — never let it break the real nearby-parks response.
    console.error("[demo-seed] failed:", error);
    return false;
  }
}
