"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type AuthFormState =
  | { error: string }
  /** Sign-up succeeded but needs the emailed link clicked first — carries the
   *  address so the form can name it back to the user. */
  | { confirm: string }
  | null;

export async function signUpWithEmail(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const name = String(formData.get("name") ?? "");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name } },
  });

  if (error) return { error: error.message };

  // With Supabase's "Confirm email" setting on, signUp succeeds without
  // creating a session. Redirecting here would bounce off the auth proxy
  // straight back to /login with nothing explaining why, which reads as a
  // silent failure — so say what happened instead.
  if (!data.session) return { confirm: email };

  redirect("/dogs");
}

export async function signInWithEmail(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Supabase's own wording ("Email not confirmed") doesn't tell them what to do.
    if (/email not confirmed/i.test(error.message)) {
      return {
        error: "Confirm your email first — open the link we sent to " + email + ", then log in.",
      };
    }
    return { error: error.message };
  }
  redirect("/map");
}

export async function signInWithGoogle() {
  const supabase = await createClient();
  const origin = (await headers()).get("origin");

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback` },
  });

  if (error || !data.url) redirect("/login");
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
