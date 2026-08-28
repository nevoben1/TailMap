import { getOrCreateUser, getSupabaseUser } from "@/lib/actions/users";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

import { DogEditor } from "./dog-editor";
import { DogRail } from "./dog-rail";

export default async function DogsPage({
  searchParams,
}: {
  searchParams: Promise<{ dog?: string }>;
}) {
  const supabaseUser = await getSupabaseUser();
  if (!supabaseUser) redirect("/login");

  // Runs alongside the user-row upsert instead of waiting on it — the dogs
  // query only needs the id, which we already have.
  const [, dogs] = await Promise.all([
    getOrCreateUser(),
    prisma.dog.findMany({
      where: { ownerId: supabaseUser.id },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const { dog: dogIdParam } = await searchParams;
  const isNew = dogIdParam === "new";
  const selectedDog = isNew
    ? null
    : (dogs.find((d) => d.id === dogIdParam) ?? dogs[0] ?? null);

  return (
    <main
      className="flex-1 flex min-h-0"
      style={{
        maxWidth: 1240,
        width: "100%",
        margin: "0 auto",
        padding: "30px 35px 60px",
        gap: 26,
        boxSizing: "border-box",
        overflowY: "auto",
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
          // main is a scrolling flex row; without this the panel's height is
          // pinned to the visible line height and its background gets cut off
          // where the form scrolls past. Grow with content, but still fill the
          // viewport when the form is short.
          alignSelf: "flex-start",
          minHeight: "100%",
        }}
      >
        <DogEditor key={selectedDog?.id ?? "new"} dog={selectedDog} />
      </div>
    </main>
  );
}
