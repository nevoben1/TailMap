import { notFound, redirect } from "next/navigation";

import { getThreadForUser } from "@/lib/chat";
import { getSessionUserId } from "@/lib/actions/users";

import { Thread } from "./thread";

export const dynamic = "force-dynamic";

export default async function ChatThreadPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const [userId, { conversationId }] = await Promise.all([
    getSessionUserId(),
    params,
  ]);
  if (!userId) redirect("/login");

  const thread = await getThreadForUser(conversationId, userId);
  if (!thread) notFound();

  return (
    <Thread
      conversationId={thread.conversationId}
      me={userId}
      other={thread.other}
      initialMessages={thread.messages}
      blockedByMe={thread.blockedByMe}
      blocksMe={thread.blocksMe}
    />
  );
}
