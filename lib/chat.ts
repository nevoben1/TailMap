import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Chat data helpers (specs.md §15 / architecture.md §14). Read-side only;
 * mutations live in lib/actions/chat.ts. Everything here runs on the pooled
 * Prisma connection (BYPASSRLS role) — RLS on the chat tables exists purely to
 * scope the browser's Realtime subscription, not these server queries.
 */

/** Canonical 1:1 key so (a,b) and (b,a) resolve to the same conversation. */
export function directPairKey(userA: string, userB: string): string {
  return [userA, userB].sort().join(":");
}

export type InboxRow = {
  conversationId: string;
  lastMessageAt: Date;
  other: { id: string; name: string; avatarInitial: string };
  lastMessage: { body: string; senderId: string; createdAt: Date } | null;
  unread: number;
};

/** specs §15.2 — inbox list, most-recent first, with per-conversation unread counts. */
export async function getInboxConversations(userId: string): Promise<InboxRow[]> {
  const parts = await prisma.conversationParticipant.findMany({
    where: { userId },
    include: {
      conversation: {
        include: {
          participants: {
            where: { userId: { not: userId } },
            include: { user: { select: { id: true, name: true, avatarInitial: true } } },
          },
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
    orderBy: { conversation: { lastMessageAt: "desc" } },
  });

  const rows = await Promise.all(
    parts.map(async (p) => {
      const other = p.conversation.participants[0]?.user;
      const last = p.conversation.messages[0] ?? null;
      const unread = await prisma.message.count({
        where: {
          conversationId: p.conversationId,
          senderId: { not: userId },
          createdAt: { gt: p.lastReadAt },
        },
      });
      return {
        conversationId: p.conversationId,
        lastMessageAt: p.conversation.lastMessageAt,
        other: other ?? { id: "", name: "Unknown", avatarInitial: "?" },
        lastMessage: last
          ? { body: last.body, senderId: last.senderId, createdAt: last.createdAt }
          : null,
        unread,
      };
    })
  );

  return rows;
}

/** Total unread across every conversation — drives the nav badge (specs §15.2). */
export async function getUnreadTotal(userId: string): Promise<number> {
  const parts = await prisma.conversationParticipant.findMany({
    where: { userId },
    select: { conversationId: true, lastReadAt: true },
  });
  if (parts.length === 0) return 0;

  const counts = await Promise.all(
    parts.map((p) =>
      prisma.message.count({
        where: {
          conversationId: p.conversationId,
          senderId: { not: userId },
          createdAt: { gt: p.lastReadAt },
        },
      })
    )
  );
  return counts.reduce((a, b) => a + b, 0);
}

export type ThreadData = {
  conversationId: string;
  other: { id: string; name: string; avatarInitial: string };
  messages: { id: string; body: string; senderId: string; createdAt: string }[];
  blockedByMe: boolean;
  blocksMe: boolean;
};

/**
 * Full thread for `userId`, or null when they are not a participant
 * (page turns that into a 404 — specs §15.2).
 */
export async function getThreadForUser(
  conversationId: string,
  userId: string
): Promise<ThreadData | null> {
  const membership = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!membership) return null;

  const otherPart = await prisma.conversationParticipant.findFirst({
    where: { conversationId, userId: { not: userId } },
    include: { user: { select: { id: true, name: true, avatarInitial: true } } },
  });
  const other = otherPart?.user ?? { id: "", name: "Unknown", avatarInitial: "?" };

  const [messages, blockedByMe, blocksMe] = await Promise.all([
    prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take: 200,
    }),
    other.id
      ? prisma.block.findUnique({
          where: { blockerId_blockedId: { blockerId: userId, blockedId: other.id } },
        })
      : Promise.resolve(null),
    other.id
      ? prisma.block.findUnique({
          where: { blockerId_blockedId: { blockerId: other.id, blockedId: userId } },
        })
      : Promise.resolve(null),
  ]);

  return {
    conversationId,
    other,
    messages: messages.map((m) => ({
      id: m.id,
      body: m.body,
      senderId: m.senderId,
      createdAt: m.createdAt.toISOString(),
    })),
    blockedByMe: Boolean(blockedByMe),
    blocksMe: Boolean(blocksMe),
  };
}
