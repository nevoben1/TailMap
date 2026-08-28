"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { signOut } from "@/lib/actions/auth";

const LINKS = [
  { href: "/map", label: "Map" },
  { href: "/dogs", label: "My Dogs" },
  { href: "/settings", label: "Settings" },
];

export function Nav({ avatarInitial }: { avatarInitial: string }) {
  const pathname = usePathname();

  return (
    <nav className="nav flex-none">
      <span className="nav-brand">Tailmap</span>
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={pathname.startsWith(link.href) ? "page" : undefined}
        >
          {link.label}
        </Link>
      ))}
      <div
        className="rounded-full flex items-center justify-center"
        style={{
          width: 34,
          height: 34,
          background: "var(--color-accent-2-200)",
          color: "var(--color-accent-2-800)",
          fontFamily: "var(--font-heading)",
          fontSize: 13,
        }}
      >
        {avatarInitial}
      </div>
      <form action={signOut}>
        <button
          type="submit"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "inherit",
            fontSize: 14,
            padding: 0,
            fontFamily: "inherit",
          }}
        >
          Log out
        </button>
      </form>
    </nav>
  );
}
