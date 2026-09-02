"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { directPairKey, getUnreadTotal } from "@/lib/chat";
import { getOrCreateUser, getSessionUserId } from "@/lib/actions/users";
import { DEMO_USER_ID } from "@/lib/demo-seed";
import { sendChatNudgeEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

const MAX_BODY = 4000;

// specs §15.5 — email-nudge guards.
const RECENT_ACTIVE_MS = 60 * 1000; // recipient read this thread <60s ago ⇒ still here
const EMAIL_COOLDOWN_MS = 10 * 60 * 1000; // ≤1 nudge per conversation per 10 min

/**
 * Fire-and-forget "you have unread messages" email for the other participant,
 * scheduled via `after()` so it never delays the send. No scheduler
 * (architecture.md §14.4).
 */
async function maybeNudgeByEmail(
  conversationId: string,
  senderId: string,
  senderName: string,
  body: string,
  origin: string
) {
  try {
    const other = await prisma.conversationParticipant.findFirst({
      where: { conversationId, userId: { not: senderId } },
      include: { user: { include: { settings: true } } },
    });
    if (!other?.user?.email) return;
    // The demo account's address is a placeholder — never try to mail it.
    if (other.userId === DEMO_USER_ID) return;

    const now = Date.now();
    const lastRead = other.lastReadAt.getTime();
    const lastEmail = other.lastChatEmailAt?.getTime() ?? 0;

    if (other.user.settings?.notifyEmail === false) return;
    if (now - lastRead < RECENT_ACTIVE_MS) return; // likely reading the thread now
    if (lastEmail && lastEmail > lastRead) return; // already nudged, still unread
    if (lastEmail && now - lastEmail < EMAIL_COOLDOWN_MS) return; // cooldown floor

    const res = await sendChatNudgeEmail({
      to: other.user.email,
      recipientName: other.user.name,
      senderName,
      snippet: body,
      threadUrl: `${origin}/chat/${conversationId}`,
    });

    // Only stamp when an email actually went out — a "not configured" or failed
    // send stays eligible for the next message.
    if (res.ok) {
      await prisma.conversationParticipant.update({
        where: { conversationId_userId: { conversationId, userId: other.userId } },
        data: { lastChatEmailAt: new Date() },
      });
    } else if (!("skipped" in res)) {
      console.error("[chat] nudge email failed:", res.error);
    }
  } catch (err) {
    console.error("[chat] maybeNudgeByEmail threw:", err);
  }
}

async function blockExists(a: string, b: string) {
  const [ab, ba] = await Promise.all([
    prisma.block.findUnique({ where: { blockerId_blockedId: { blockerId: a, blockedId: b } } }),
    prisma.block.findUnique({ where: { blockerId_blockedId: { blockerId: b, blockedId: a } } }),
  ]);
  return Boolean(ab || ba);
}

/**
 * Get-or-create the 1:1 conversation between the caller and `otherUserId`,
 * then navigate to it (specs §15.3). Deduped by `pairKey`.
 */
export async function startConversation(otherUserId: string): Promise<never> {
  const me = await getOrCreateUser();
  if (!me) redirect("/login");
  if (!otherUserId || otherUserId === me.id) redirect("/chat");

  const other = await prisma.user.findUnique({
    where: { id: otherUserId },
    select: { id: true },
  });
  if (!other) redirect("/chat");

  if (await blockExists(me.id, other.id)) redirect("/chat");

  const pairKey = directPairKey(me.id, other.id);

  const existing = await prisma.conversation.findUnique({
    where: { pairKey },
    select: { id: true },
  });

  let conversationId = existing?.id;
  if (!conversationId) {
    try {
      const created = await prisma.conversation.create({
        data: {
          pairKey,
          participants: {
            create: [{ userId: me.id }, { userId: other.id }],
          },
        },
        select: { id: true },
      });
      conversationId = created.id;
    } catch {
      // Lost a race on the unique pairKey — re-read the winner's row.
      const row = await prisma.conversation.findUnique({
        where: { pairKey },
        select: { id: true },
      });
      conversationId = row?.id;
    }
  }

  if (!conversationId) redirect("/chat");
  redirect(`/chat/${conversationId}`);
}

/** Form-action wrapper: <form action={startConversationAction}> with a hidden `to`. */
export async function startConversationAction(formData: FormData): Promise<never> {
  return startConversation(String(formData.get("to") ?? ""));
}

export type SentMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
};
export type SendResult = { ok: true; message: SentMessage } | { error: string };

export async function sendMessage(
  conversationId: string,
  rawBody: string
): Promise<SendResult> {
  const me = await getOrCreateUser();
  if (!me) return { error: "Not signed in." };

  const body = rawBody.trim();
  if (!body) return { error: "Message is empty." };
  if (body.length > MAX_BODY) return { error: "Message is too long." };

  const membership = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId: me.id } },
  });
  if (!membership) return { error: "Conversation not found." };

  const other = await prisma.conversationParticipant.findFirst({
    where: { conversationId, userId: { not: me.id } },
    select: { userId: true },
  });
  if (other && (await blockExists(me.id, other.userId))) {
    return { error: "You can't message this person." };
  }

  const [created] = await prisma.$transaction([
    prisma.message.create({ data: { conversationId, senderId: me.id, body } }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    }),
    // Sending marks the thread read for the sender.
    prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId: me.id } },
      data: { lastReadAt: new Date() },
    }),
  ]);

  revalidatePath("/chat");

  // specs §15.5 — nudge the recipient by email after the response, never blocking it.
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (await headers()).get("origin") ||
    "";
  after(() => maybeNudgeByEmail(conversationId, me.id, me.name, body, origin));

  return {
    ok: true,
    message: {
      id: created.id,
      conversationId,
      senderId: me.id,
      body: created.body,
      createdAt: created.createdAt.toISOString(),
    },
  };
}

/** Authoritative unread total for the current user — the live nav badge
 *  re-queries this on any Realtime chat activity (architecture.md §14.3). */
export async function getUnreadTotalAction(): Promise<number> {
  const userId = await getSessionUserId();
  if (!userId) return 0;
  return getUnreadTotal(userId);
}

export async function markRead(conversationId: string): Promise<void> {
  const me = await getOrCreateUser();
  if (!me) return;

  await prisma.conversationParticipant.updateMany({
    where: { conversationId, userId: me.id },
    data: { lastReadAt: new Date() },
  });
  revalidatePath("/chat");
}

export async function blockUser(otherUserId: string): Promise<void> {
  const me = await getOrCreateUser();
  if (!me || !otherUserId || otherUserId === me.id) return;

  await prisma.block.upsert({
    where: { blockerId_blockedId: { blockerId: me.id, blockedId: otherUserId } },
    update: {},
    create: { blockerId: me.id, blockedId: otherUserId },
  });
  revalidatePath("/chat");
}

export async function unblockUser(otherUserId: string): Promise<void> {
  const me = await getOrCreateUser();
  if (!me) return;

  await prisma.block.deleteMany({
    where: { blockerId: me.id, blockedId: otherUserId },
  });
  revalidatePath("/chat");
}
