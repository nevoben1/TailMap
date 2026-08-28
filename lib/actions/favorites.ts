"use server";

import { revalidatePath } from "next/cache";

import { getOrCreateUser } from "@/lib/actions/users";
import { prisma } from "@/lib/prisma";

export async function toggleFavorite(parkId: string) {
  const user = await getOrCreateUser();
  if (!user) throw new Error("Not authenticated.");

  const existing = await prisma.favorite.findUnique({
    where: { userId_parkId: { userId: user.id, parkId } },
  });

  if (existing) {
    await prisma.favorite.delete({
      where: { userId_parkId: { userId: user.id, parkId } },
    });
  } else {
    await prisma.favorite.create({ data: { userId: user.id, parkId } });
  }

  revalidatePath("/map");
}
