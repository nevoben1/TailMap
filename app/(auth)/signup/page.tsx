import Link from "next/link";

import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <div className="flex flex-col" style={{ gap: 13 }}>
      <h2 style={{ margin: "0 0 4px" }}>Create your account</h2>
      <p className="text-muted" style={{ fontSize: 13, margin: "0 0 13px" }}>
        Takes about a minute — you&apos;ll set up your dog&apos;s profile next.
      </p>
      <SignupForm />
      <p className="text-muted" style={{ fontSize: 13, textAlign: "center" }}>
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </div>
  );
}
