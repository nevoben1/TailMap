"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { blockUser, markRead, sendMessage, unblockUser } from "@/lib/actions/chat";
import { subscribeToConversationMessages } from "@/lib/realtime";

type Msg = { id: string; body: string; senderId: string; createdAt: string };

export function Thread({
  conversationId,
  me,
  other,
  initialMessages,
  blockedByMe: initialBlockedByMe,
  blocksMe,
}: {
  conversationId: string;
  me: string;
  other: { id: string; name: string; avatarInitial: string };
  initialMessages: Msg[];
  blockedByMe: boolean;
  blocksMe: boolean;
}) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockedByMe, setBlockedByMe] = useState(initialBlockedByMe);
  const [menuOpen, setMenuOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    bottomRef.current?.scrollIntoView({ behavior });
  }, []);

  const addMessage = useCallback((m: Msg) => {
    setMessages((prev) => {
      if (prev.some((x) => x.id === m.id)) return prev;
      // Replace an optimistic echo (same sender + body, temp id).
      const tempIdx = prev.findIndex(
        (x) => x.id.startsWith("temp-") && x.senderId === m.senderId && x.body === m.body
      );
      if (tempIdx !== -1) {
        const next = prev.slice();
        next[tempIdx] = m;
        return next;
      }
      return [...prev, m];
    });
  }, []);

  // Mark read on mount.
  useEffect(() => {
    void markRead(conversationId);
  }, [conversationId]);

  // Realtime subscription (architecture.md §14.3).
  useEffect(() => {
    const unsub = subscribeToConversationMessages(conversationId, (row) => {
      addMessage({
        id: row.id,
        body: row.body,
        senderId: row.senderId,
        createdAt: row.createdAt,
      });
      if (row.senderId !== me) void markRead(conversationId);
    });
    return unsub;
  }, [conversationId, me, addMessage]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const canMessage = !blocksMe && !blockedByMe;

  async function submit() {
    const body = draft.trim();
    if (!body || sending) return;
    setError(null);
    setSending(true);

    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: tempId, body, senderId: me, createdAt: new Date().toISOString() },
    ]);
    setDraft("");

    try {
      const res = await sendMessage(conversationId, body);
      if ("error" in res) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setDraft(body);
        setError(res.error);
      } else {
        addMessage(res.message);
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setDraft(body);
      setError("Could not send. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="chat-thread flex-1 min-h-0">
      <header className="chat-thread__head">
        <Link href="/chat" className="chat-thread__back" aria-label="Back to messages">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <span className="chat-thread__avatar" aria-hidden>{other.avatarInitial}</span>
        <span className="chat-thread__name">{other.name}</span>

        <div className="chat-thread__menu">
          <button
            type="button"
            className="chat-thread__menu-btn"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Conversation options"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" />
            </svg>
          </button>
          {menuOpen && (
            <div className="chat-thread__menu-pop" role="menu">
              {blockedByMe ? (
                <button
                  type="button"
                  role="menuitem"
                  className="chat-thread__menu-item"
                  onClick={async () => {
                    setMenuOpen(false);
                    await unblockUser(other.id);
                    setBlockedByMe(false);
                  }}
                >
                  Unblock
                </button>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  className="chat-thread__menu-item"
                  onClick={async () => {
                    setMenuOpen(false);
                    await blockUser(other.id);
                    setBlockedByMe(true);
                  }}
                >
                  Block
                </button>
              )}
              <a
                role="menuitem"
                className="chat-thread__menu-item"
                href={`mailto:abuse@tailmap.app?subject=${encodeURIComponent(
                  `Report conversation ${conversationId}`
                )}`}
              >
                Report&hellip;
              </a>
            </div>
          )}
        </div>
      </header>

      <div className="chat-thread__scroll" ref={scrollRef}>
        {messages.length === 0 ? (
          <p className="chat-thread__hint">Say hello 👋</p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`chat-bubble ${m.senderId === me ? "chat-bubble--mine" : "chat-bubble--theirs"}`}
            >
              {m.body}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="chat-thread__error">{error}</p>}

      {blocksMe ? (
        <p className="chat-thread__blocked">You can&apos;t message this person.</p>
      ) : blockedByMe ? (
        <p className="chat-thread__blocked">
          You&apos;ve blocked this person.{" "}
          <button
            type="button"
            className="chat-thread__inline-link"
            onClick={async () => {
              await unblockUser(other.id);
              setBlockedByMe(false);
            }}
          >
            Unblock
          </button>
        </p>
      ) : (
        <form
          className="chat-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <textarea
            className="chat-composer__input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder={`Message ${other.name}`}
            rows={1}
            disabled={!canMessage}
          />
          <button
            type="submit"
            className="btn btn-primary chat-composer__send"
            disabled={!canMessage || sending || draft.trim().length === 0}
          >
            {sending ? "…" : "Send"}
          </button>
        </form>
      )}
    </main>
  );
}
