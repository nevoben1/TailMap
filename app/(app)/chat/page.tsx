import Link from "next/link";
import { redirect } from "next/navigation";

import { getInboxConversations } from "@/lib/chat";
import { getSessionUserId } from "@/lib/actions/users";

import { InboxLive } from "./inbox-live";

export const dynamic = "force-dynamic";

function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default async function ChatInboxPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const rows = await getInboxConversations(userId);

  return (
    <main className="chat-inbox flex-1 min-h-0" style={{ overflowY: "auto" }}>
      <InboxLive meId={userId} />
      <div className="chat-inbox__inner">
        <h1 className="chat-inbox__title">Messages</h1>

        {rows.length === 0 ? (
          <div className="chat-empty">
            <p className="chat-empty__title">No conversations yet</p>
            <p className="chat-empty__body">
              Open a park&apos;s &ldquo;who&apos;s here now&rdquo; list or your active
              session and tap <strong>Message owner</strong> to start one.
            </p>
          </div>
        ) : (
          <ul className="chat-list">
            {rows.map((row) => (
              <li key={row.conversationId}>
                <Link href={`/chat/${row.conversationId}`} className="chat-list__row">
                  <span className="chat-list__avatar" aria-hidden>
                    {row.other.avatarInitial}
                  </span>
                  <span className="chat-list__main">
                    <span className="chat-list__top">
                      <span className="chat-list__name">{row.other.name}</span>
                      <span className="chat-list__time">
                        {relativeTime(row.lastMessageAt)}
                      </span>
                    </span>
                    <span className="chat-list__preview">
                      {row.lastMessage
                        ? `${row.lastMessage.senderId === userId ? "You: " : ""}${row.lastMessage.body}`
                        : "No messages yet"}
                    </span>
                  </span>
                  {row.unread > 0 && (
                    <span className="chat-list__unread" aria-label={`${row.unread} unread`}>
                      {row.unread}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
