import { getOrCreateUser } from "@/lib/actions/users";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

import { DogEditor } from "./dog-editor";
import { DogRail } from "./dog-rail";

export default async function DogsPage({
  searchParams,
}: {
  searchParams: Promise<{ dog?: string }>;
}) {
  const user = await getOrCreateUser();
  if (!user) redirect("/login");

  const dogs = await prisma.dog.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
  });

  const { dog: dogIdParam } = await searchParams;
  const isNew = dogIdParam === "new";
  const selectedDog = isNew
    ? null
    : (dogs.find((d) => d.id === dogIdParam) ?? dogs[0] ?? null);

  return (
    <main
      className="flex-1 flex"
      style={{
        maxWidth: 1240,
        width: "100%",
        margin: "0 auto",
        padding: "30px 35px 60px",
        gap: 26,
        boxSizing: "border-box",
      }}
    >
      <DogRail dogs={dogs} selectedDogId={selectedDog?.id} />
      <div
        className="flex-1"
        style={{
          background: "var(--color-surface)",
          borderRadius: 32,
          padding: 35,
          boxSizing: "border-box",
        }}
      >
        <DogEditor key={selectedDog?.id ?? "new"} dog={selectedDog} />
      </div>
    </main>
  );
}
