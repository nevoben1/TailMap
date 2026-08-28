"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { signOut } from "@/lib/actions/auth";
import { getUnreadTotalAction } from "@/lib/actions/chat";
import { DURATION, springSnappy } from "@/lib/motion";
import { subscribeToInboxActivity } from "@/lib/realtime";

type IconLink = { href: string; label: string; icon: React.ReactNode };

const MapIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
    <line x1="9" y1="3" x2="9" y2="18" />
    <line x1="15" y1="6" x2="15" y2="21" />
  </svg>
);

const DogIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M11.25 16.25h1.5L12 17z" />
    <path d="M16 14v.5" />
    <path d="M8 14v.5" />
    <path d="M4.42 11.25A13.15 13.15 0 0 0 4 14.56C4 18.73 7.58 21 12 21s8-2.27 8-6.44a11.7 11.7 0 0 0-.49-3.31" />
    <path d="M8.5 8.5c-.38 1.05-1.08 2.03-2.34 2.5-1.93.72-3.58-.3-3.66-1-.11-.99 1.18-6.53 4-7 1.92-.32 3.65.85 3.65 2.24A7.5 7.5 0 0 1 14 5.28c0-1.39 1.84-2.6 3.77-2.28 2.82.47 4.11 6.01 4 7-.08.7-1.73 1.72-3.66 1-1.26-.47-1.85-1.45-2.24-2.5" />
  </svg>
);

const ChatIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);

const GearIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const LINKS: IconLink[] = [
  { href: "/map", label: "Map", icon: MapIcon },
  { href: "/dogs", label: "My Dogs", icon: DogIcon },
];

/** "Tailmap" wordmark — a map pin replaces the dot of the "i". */
function Wordmark() {
  return (
    <span className="nav-logo__mark">
      Ta
      <span className="nav-logo__i">
        {"ı"}
        <svg className="nav-logo__pin" viewBox="0 0 24 24" aria-hidden>
          <path
            d="M12 2C8.7 2 6 4.7 6 8c0 4.4 4.6 10.4 5.6 11.6a.5.5 0 0 0 .8 0C13.4 18.4 18 12.4 18 8c0-3.3-2.7-6-6-6z"
            fill="currentColor"
          />
          <circle cx="12" cy="8" r="2.2" fill="var(--color-surface)" />
        </svg>
      </span>
      lmap
    </span>
  );
}

function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="nav-menu" ref={ref}>
      <button
        type="button"
        className="nav-icon-btn"
        aria-label="Settings"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {GearIcon}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="nav-menu__pop"
            role="menu"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: DURATION.fast }}
          >
            <Link href="/settings" role="menuitem" className="nav-menu__item" onClick={() => setOpen(false)}>
              Settings
            </Link>
            <form action={signOut}>
              <button type="submit" role="menuitem" className="nav-menu__item">
                Logout
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Nav({
  avatarInitial,
  meId,
  unreadCount = 0,
}: {
  avatarInitial: string;
  meId: string;
  unreadCount?: number;
}) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const [unread, setUnread] = useState(unreadCount);

  // Live badge (architecture.md §14.3): on any Realtime chat activity, re-query
  // the authoritative total rather than tracking deltas locally. Also refresh
  // when the tab regains focus.
  useEffect(() => {
    if (!meId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      getUnreadTotalAction()
        .then(setUnread)
        .catch(() => {});
    };
    const debouncedRefresh = () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 400);
    };
    const onFocus = () => {
      if (document.visibilityState === "visible") refresh();
    };

    const unsub = subscribeToInboxActivity(meId, debouncedRefresh);
    document.addEventListener("visibilitychange", onFocus);
    refresh();

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onFocus);
      unsub();
    };
  }, [meId]);

  const links: IconLink[] = [
    ...LINKS,
    { href: "/chat", label: "Messages", icon: ChatIcon },
  ];

  return (
    <nav className="nav flex-none">
      <div className="nav-side" />

      <Link href="/map" className="nav-logo" aria-label="Tailmap — home">
        <Wordmark />
      </Link>

      <div className="nav-side nav-side--end">
        {links.map((link) => {
          const active = pathname.startsWith(link.href);
          const showBadge = link.href === "/chat" && unread > 0;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="nav-link nav-icon-btn"
              aria-label={
                showBadge ? `${link.label} (${unread} unread)` : link.label
              }
              aria-current={active ? "page" : undefined}
            >
              {link.icon}
              {showBadge && (
                <span className="nav-badge" aria-hidden>
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
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
        <SettingsMenu />
        <div className="nav-avatar" aria-hidden>
          {avatarInitial}
        </div>
      </div>
    </nav>
  );
}
