"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionUserId } from "@/lib/actions/users";
import { prisma } from "@/lib/prisma";

const DEFAULT_EXPIRY_HOURS = 3;

/** specs.md §6 — one active check-in per dog; checking in elsewhere ends the previous session. */
export async function checkIn(dogId: string, parkId: string) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  // Ownership check and expiry lookup don't depend on each other — run together.
  const [dog, settings] = await Promise.all([
    prisma.dog.findUnique({ where: { id: dogId }, select: { ownerId: true } }),
    prisma.settings.findUnique({
      where: { userId },
      select: { checkInExpiryHours: true },
    }),
  ]);
  if (!dog || dog.ownerId !== userId) throw new Error("Dog not found.");

  const expiryHours = settings?.checkInExpiryHours ?? DEFAULT_EXPIRY_HOURS;

  // One batched round trip instead of two sequential writes.
  await prisma.$transaction([
    prisma.checkIn.updateMany({
      where: { dogId, endedAt: null },
      data: { endedAt: new Date() },
    }),
    prisma.checkIn.create({
      data: {
        dogId,
        parkId,
        expiresAt: new Date(Date.now() + expiryHours * 60 * 60 * 1000),
      },
    }),
  ]);

  // The caller navigates to /session client-side. Not redirecting from here
  // means the action response doesn't also have to server-render /session
  // before it can resolve — the button's pending state and the navigation
  // then line up instead of the button freeing up seconds before the page moves.
  revalidatePath("/map");
}

export async function endSession(dogId: string) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const dog = await prisma.dog.findUnique({
    where: { id: dogId },
    select: { ownerId: true },
  });
  if (!dog || dog.ownerId !== userId) throw new Error("Dog not found.");

  await prisma.checkIn.updateMany({
    where: { dogId, endedAt: null },
    data: { endedAt: new Date() },
  });

  revalidatePath("/map");
  redirect("/map");
}
