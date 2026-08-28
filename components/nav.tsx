"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { signOut } from "@/lib/actions/auth";
import { springSnappy } from "@/lib/motion";

const LINKS = [
  { href: "/map", label: "Map" },
  { href: "/dogs", label: "My Dogs" },
  { href: "/settings", label: "Settings" },
];

export function Nav({ avatarInitial }: { avatarInitial: string }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  return (
    <nav className="nav flex-none">
      <span className="nav-brand">Tailmap</span>
      {LINKS.map((link) => {
        const active = pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className="nav-link"
            aria-current={active ? "page" : undefined}
          >
            {link.label}
            {active && (
              <motion.span
                layoutId="nav-underline"
                className="nav-underline"
                transition={reduce ? { duration: 0 } : springSnappy}
              />
            )}
          </Link>
        );
      })}
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
