"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getOrCreateUser } from "@/lib/actions/users";
import { TRAIT_DEFS } from "@/lib/dog-attributes";
import { prisma } from "@/lib/prisma";

export type SaveDogState = { error: string } | null;

export async function saveDog(
  _prevState: SaveDogState,
  formData: FormData
): Promise<SaveDogState> {
  const user = await getOrCreateUser();
  if (!user) redirect("/login");

  const id = formData.get("id") ? String(formData.get("id")) : null;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name is required." };

  const photoUrlRaw = formData.get("photoUrl");
  const photoUrl = typeof photoUrlRaw === "string" && photoUrlRaw.length > 0 ? photoUrlRaw : null;

  const attrs: Record<string, string> = {};
  for (const { name: category } of TRAIT_DEFS) {
    const value = formData.get(category);
    if (!value) return { error: `${category} is required.` };
    attrs[category.toLowerCase()] = String(value);
  }

  let preferences: Record<string, "love" | "dislike"> = {};
  const rawPreferences = formData.get("preferences");
  if (typeof rawPreferences === "string" && rawPreferences.length > 0) {
    try {
      preferences = JSON.parse(rawPreferences);
    } catch {
      return { error: "Invalid preferences payload." };
    }
  }

  const data = {
    name,
    photoUrl,
    size: attrs.size,
    breed: attrs.breed,
    color: attrs.color,
    age: attrs.age,
    energy: attrs.energy,
    gender: attrs.gender,
    preferences,
  };

  if (id) {
    const existing = await prisma.dog.findUnique({ where: { id } });
    if (!existing || existing.ownerId !== user.id) {
      return { error: "Dog not found." };
    }
    await prisma.dog.update({ where: { id }, data });
  } else {
    await prisma.dog.create({ data: { ...data, ownerId: user.id } });
  }

  revalidatePath("/dogs");
  redirect("/map");
}
