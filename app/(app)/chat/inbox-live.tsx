"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { subscribeToInboxActivity } from "@/lib/realtime";

/**
 * Keeps the server-rendered inbox list current: on any Realtime chat activity
 * it debounces then calls `router.refresh()` so the list re-renders from the
 * server (authoritative ordering + unread counts). Renders nothing.
 */
export function InboxLive({ meId }: { meId: string }) {
  const router = useRouter();

  useEffect(() => {
    if (!meId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    };
    const unsub = subscribeToInboxActivity(meId, refresh);
    return () => {
      clearTimeout(timer);
      unsub();
    };
  }, [meId, router]);

  return null;
}
