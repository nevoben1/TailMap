"use server";

import { randomUUID } from "crypto";

import { getOrCreateUser } from "@/lib/actions/users";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "dog-photos";

export async function createDogPhotoUploadUrl(fileExt: string) {
  const user = await getOrCreateUser();
  if (!user) throw new Error("Not authenticated.");

  const safeExt = fileExt.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
  const path = `${user.id}/${randomUUID()}.${safeExt}`;

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) throw new Error(error?.message ?? "Could not create upload URL.");

  const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  return { signedUrl: data.signedUrl, token: data.token, path, publicUrl };
}
