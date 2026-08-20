import Link from "next/link";

import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="flex flex-col" style={{ gap: 13 }}>
      <h2 style={{ margin: "0 0 4px" }}>Welcome back</h2>
      <p className="text-muted" style={{ fontSize: 13, margin: "0 0 13px" }}>
        Log in to see who&apos;s at the park right now.
      </p>
      <LoginForm />
      <p className="text-muted" style={{ fontSize: 13, textAlign: "center" }}>
        No account? <Link href="/signup">Sign up</Link>
      </p>
    </div>
  );
}
