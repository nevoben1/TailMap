import { redirect } from "next/navigation";

import { endSession } from "@/lib/actions/checkins";
import { getOrCreateUser } from "@/lib/actions/users";
import { describeCheckedInDogs, type DogMatch } from "@/lib/grading";
import type { DogPreferences } from "@/lib/dog-attributes";
import { prisma } from "@/lib/prisma";

export default async function SessionPage({
  searchParams,
}: {
  searchParams: Promise<{ dog?: string }>;
}) {
  const user = await getOrCreateUser();
  if (!user) redirect("/login");

  const { dog: dogId } = await searchParams;
  if (!dogId) redirect("/map");

  const dog = await prisma.dog.findUnique({ where: { id: dogId } });
  if (!dog || dog.ownerId !== user.id) redirect("/map");

  const activeCheckIn = await prisma.checkIn.findFirst({
    where: { dogId, endedAt: null, expiresAt: { gt: new Date() } },
    include: { park: true },
    orderBy: { startedAt: "desc" },
  });

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
    }))
  );

  const endSessionForDog = endSession.bind(null, dogId);

  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="card elev-lg" style={{ width: "100%", maxWidth: 420 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            background: "var(--color-accent-2-100)",
            color: "var(--color-accent-2-800)",
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            padding: "5px 12px",
            borderRadius: 999,
            marginBottom: 12,
          }}
        >
          Checked in now
        </div>
        <div className="card-title" style={{ fontSize: 24, marginBottom: 4 }}>
          {activeCheckIn.park.name}
        </div>
        <p className="text-muted" style={{ fontSize: 13, marginBottom: 17 }}>
          {dog.name} checked in {new Date(activeCheckIn.startedAt).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>

        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            opacity: 0.5,
            marginBottom: 8,
          }}
        >
          Also here now
        </div>
        {alsoHere.length === 0 ? (
          <p className="text-muted" style={{ fontSize: 13 }}>No other dogs checked in right now.</p>
        ) : (
          <div className="flex flex-col gap-2" style={{ marginBottom: 17 }}>
            {alsoHere.map((match) => (
              <div key={match.dogId}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{match.name} · {match.breed}</div>
                <div
                  style={{
                    fontSize: 12,
                    color:
                      match.sign === "love"
                        ? "#3d472b"
                        : match.sign === "dislike"
                        ? "#8c491a"
                        : "rgba(32,30,29,0.6)",
                  }}
                >
                  {match.reason}
                </div>
              </div>
            ))}
          </div>
        )}

        <form action={endSessionForDog}>
          <button type="submit" className="btn btn-secondary btn-block">
            End session
          </button>
        </form>
      </div>
    </main>
  );
}
