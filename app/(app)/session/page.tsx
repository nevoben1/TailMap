import { redirect } from "next/navigation";

import { endSession } from "@/lib/actions/checkins";
import { getSessionUserId } from "@/lib/actions/users";
import { describeCheckedInDogs, type DogMatch } from "@/lib/grading";
import type { DogPreferences } from "@/lib/dog-attributes";
import { prisma } from "@/lib/prisma";

import { SessionCard } from "./session-card";

export default async function SessionPage({
  searchParams,
}: {
  searchParams: Promise<{ dog?: string }>;
}) {
  const [userId, { dog: dogId }] = await Promise.all([getSessionUserId(), searchParams]);
  if (!userId) redirect("/login");
  if (!dogId) redirect("/map");

  const [dog, activeCheckIn] = await Promise.all([
    prisma.dog.findUnique({ where: { id: dogId } }),
    prisma.checkIn.findFirst({
      where: { dogId, endedAt: null, expiresAt: { gt: new Date() } },
      include: { park: true },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  if (!dog || dog.ownerId !== userId) redirect("/map");
  if (!activeCheckIn) redirect("/map");

  const otherCheckIns = await prisma.checkIn.findMany({
    where: {
      parkId: activeCheckIn.parkId,
      dogId: { not: dogId },
      endedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { dog: true },
  });

  const alsoHere: DogMatch[] = describeCheckedInDogs(
    dogId,
    dog.preferences as DogPreferences,
    otherCheckIns.map((c) => ({
      id: c.dog.id,
      name: c.dog.name,
      breed: c.dog.breed,
      size: c.dog.size,
      color: c.dog.color,
      age: c.dog.age,
      energy: c.dog.energy,
      gender: c.dog.gender,
      ownerId: c.dog.ownerId,
    }))
  );

  const endSessionForDog = endSession.bind(null, dogId);
  const checkedInLabel = `${dog.name} checked in ${new Date(
    activeCheckIn.startedAt
  ).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;

  return (
    <main className="flex-1 flex items-center justify-center p-6 min-h-0" style={{ overflowY: "auto" }}>
      <SessionCard
        parkName={activeCheckIn.park.name}
        checkedInLabel={checkedInLabel}
        alsoHere={alsoHere}
        me={userId}
        endSession={endSessionForDog}
      />
    </main>
  );
}
