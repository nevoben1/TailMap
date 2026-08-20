"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getOrCreateUser } from "@/lib/actions/users";
import { prisma } from "@/lib/prisma";

const DEFAULT_EXPIRY_HOURS = 3;

/** specs.md §6 — one active check-in per dog; checking in elsewhere ends the previous session. */
export async function checkIn(dogId: string, parkId: string) {
  const user = await getOrCreateUser();
  if (!user) redirect("/login");

  const dog = await prisma.dog.findUnique({ where: { id: dogId } });
  if (!dog || dog.ownerId !== user.id) throw new Error("Dog not found.");

  const settings = await prisma.settings.findUnique({ where: { userId: user.id } });
  const expiryHours = settings?.checkInExpiryHours ?? DEFAULT_EXPIRY_HOURS;

  await prisma.checkIn.updateMany({
    where: { dogId, endedAt: null },
    data: { endedAt: new Date() },
  });

  await prisma.checkIn.create({
    data: {
      dogId,
      parkId,
      expiresAt: new Date(Date.now() + expiryHours * 60 * 60 * 1000),
    },
  });

  revalidatePath("/map");
  redirect(`/session?dog=${dogId}`);
}

export async function endSession(dogId: string) {
  const user = await getOrCreateUser();
  if (!user) redirect("/login");

  const dog = await prisma.dog.findUnique({ where: { id: dogId } });
  if (!dog || dog.ownerId !== user.id) throw new Error("Dog not found.");

  await prisma.checkIn.updateMany({
    where: { dogId, endedAt: null },
    data: { endedAt: new Date() },
  });

  revalidatePath("/map");
  redirect("/map");
}
