"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * Browser-side chat Realtime (architecture.md §14.3). Subscribes to INSERTs on
 * the `Message` table for one conversation via Supabase Postgres Changes. RLS
 * (migration 20260828120000_add_chat) limits what the socket is allowed to
 * stream to conversations the signed-in user participates in.
 */

export type IncomingMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
};

/** Per-instance suffix so two subscribers to the same logical topic never
 *  collide on Supabase's channel-name cache (adding `.on()` handlers to an
 *  already-`subscribe()`d channel throws). */
function uniqueSuffix(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export function subscribeToConversationMessages(
  conversationId: string,
  onInsert: (message: IncomingMessage) => void
): () => void {
  const supabase = createClient();

  // Make sure the socket carries the current access token so `auth.uid()`
  // resolves in the RLS policies. supabase-js also refreshes this on auth
  // state changes, but set it explicitly for the first connection.
  void supabase.auth.getSession().then(({ data }) => {
    if (data.session?.access_token) {
      supabase.realtime.setAuth(data.session.access_token);
    }
  });

  const channel = supabase
    .channel(`conversation:${conversationId}:${uniqueSuffix()}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "Message",
        filter: `conversationId=eq.${conversationId}`,
      },
      (payload) => {
        const row = payload.new as Record<string, unknown>;
        onInsert({
          id: String(row.id),
          conversationId: String(row.conversationId),
          senderId: String(row.senderId),
          body: String(row.body),
          createdAt: String(row.createdAt),
        });
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

/**
 * Per-user "something changed in my chats" signal (architecture.md §14.3) —
 * drives the live nav unread badge and the live inbox list. Fires on any
 * `Message` INSERT the viewer is allowed to see (RLS-scoped) and on updates to
 * the viewer's own `ConversationParticipant` rows (i.e. a read on another tab
 * or device). The callback is expected to debounce and then re-query the
 * authoritative count / list from the server rather than track deltas locally.
 */
/**
 * Same-tab "I just changed my own unread state" signal.
 *
 * subscribeToInboxActivity below also listens for ConversationParticipant
 * UPDATEs, but that's a server round trip over the socket for something the tab
 * already knows — and it doesn't land reliably, which left the badge showing a
 * count for a thread the viewer was reading. This fires locally and
 * immediately; Realtime stays responsible for other tabs and devices.
 */
const UNREAD_CHANGED_EVENT = "tailmap:unread-changed";

export function notifyUnreadChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(UNREAD_CHANGED_EVENT));
}

export function onUnreadChanged(handler: () => void): () => void {
  window.addEventListener(UNREAD_CHANGED_EVENT, handler);
  return () => window.removeEventListener(UNREAD_CHANGED_EVENT, handler);
}

export function subscribeToInboxActivity(
  userId: string,
  onChange: () => void
): () => void {
  const supabase = createClient();

  void supabase.auth.getSession().then(({ data }) => {
    if (data.session?.access_token) {
      supabase.realtime.setAuth(data.session.access_token);
    }
  });

  const channel = supabase
    .channel(`inbox:${userId}:${uniqueSuffix()}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "Message" },
      () => onChange()
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "ConversationParticipant",
        filter: `userId=eq.${userId}`,
      },
      () => onChange()
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
