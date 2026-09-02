"use client";

import Link from "next/link";
import { useActionState } from "react";

import { GoogleIcon } from "@/components/google-icon";
import { signUpWithEmail, signInWithGoogle, type AuthFormState } from "@/lib/actions/auth";

export function SignupForm() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    signUpWithEmail,
    null
  );

  // Confirmation required: the account exists but there's no session yet, so
  // there is nothing useful to show behind the form — replace it outright.
  if (state && "confirm" in state) {
    return (
      <div className="flex flex-col" style={{ gap: 10 }}>
        <h2 style={{ fontSize: 20 }}>Check your email</h2>
        <p className="text-muted" style={{ fontSize: 13 }}>
          We sent a confirmation link to <strong>{state.confirm}</strong>. Open it to
          activate your account, then log in.
        </p>
        <p className="text-muted" style={{ fontSize: 13 }}>
          No email after a minute? Check the spam folder.
        </p>
        <Link href="/login" className="btn btn-primary btn-block" style={{ marginTop: 8 }}>
          Go to log in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ gap: 13 }}>
      <form action={signInWithGoogle}>
        <button type="submit" className="btn btn-secondary btn-block flex items-center justify-center gap-2">
          <GoogleIcon />
          Continue with Google
        </button>
      </form>

      <div className="flex items-center gap-3" style={{ color: "rgba(32,30,29,0.4)", fontSize: 12, margin: "2px 0" }}>
        <div style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
        or sign up with email
        <div style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
      </div>

      <form action={formAction} className="flex flex-col" style={{ gap: 13 }}>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" name="name" type="text" required className="input" />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required className="input" />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={6}
            className="input"
          />
        </div>
        {state && "error" in state && (
          <p style={{ color: "var(--color-accent-800)", fontSize: 13 }}>{state.error}</p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary btn-block"
          style={{ marginTop: 8 }}
        >
          {pending ? "Creating account…" : "Create account"}
        </button>
      </form>
    </div>
  );
}
