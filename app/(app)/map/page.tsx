import { redirect } from "next/navigation";

import { getOrCreateUser } from "@/lib/actions/users";
import { prisma } from "@/lib/prisma";

import { MapClient } from "./map-client";

export default async function MapPage() {
  const user = await getOrCreateUser();
  if (!user) redirect("/login");

  const dogs = await prisma.dog.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
  });

  if (dogs.length === 0) redirect("/dogs?dog=new");

  const settings = await prisma.settings.findUnique({ where: { userId: user.id } });

  return (
    <MapClient
      dogs={dogs.map((d) => ({ id: d.id, name: d.name, breed: d.breed }))}
      radiusMiles={settings?.discoveryRadius ?? 3}
    />
  );
}
