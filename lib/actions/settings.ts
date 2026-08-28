"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getOrCreateUser } from "@/lib/actions/users";
import { prisma } from "@/lib/prisma";

const VALID_RADII = [1, 3, 5, 10];
const VALID_UNITS = ["mi", "km"];
const VALID_EXPIRY_HOURS = [1, 2, 3, 6, 12, 24];

export async function getOrCreateSettings(userId: string) {
  // Read first — the row exists on every visit after the first, and an
  // unconditional upsert means a write query on every single page view.
  const existing = await prisma.settings.findUnique({ where: { userId } });
  return existing ?? prisma.settings.create({ data: { userId } });
}

export type SaveSettingsState = { error: string } | null;

export async function saveSettings(
  _prevState: SaveSettingsState,
  formData: FormData
): Promise<SaveSettingsState> {
  const user = await getOrCreateUser();
  if (!user) return { error: "Not authenticated." };

  const discoveryRadius = Number(formData.get("discoveryRadius"));
  const distanceUnit = String(formData.get("distanceUnit"));
  const checkInExpiryHours = Number(formData.get("checkInExpiryHours"));
  const notifyEmail = formData.get("notifyEmail") != null;

  if (!VALID_RADII.includes(discoveryRadius)) {
    return { error: "Invalid discovery radius." };
  }
  if (!VALID_UNITS.includes(distanceUnit)) {
    return { error: "Invalid distance unit." };
  }
  if (!VALID_EXPIRY_HOURS.includes(checkInExpiryHours)) {
    return { error: "Invalid check-in expiry." };
  }

  await prisma.settings.upsert({
    where: { userId: user.id },
    update: { discoveryRadius, distanceUnit, checkInExpiryHours, notifyEmail },
    create: { userId: user.id, discoveryRadius, distanceUnit, checkInExpiryHours, notifyEmail },
  });

  revalidatePath("/map");
  redirect("/map");
}
