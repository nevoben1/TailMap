-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "notifyEmail" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "pairKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationParticipant" (
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastChatEmailAt" TIMESTAMP(3),

    CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("conversationId","userId")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Block" (
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("blockerId","blockedId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_pairKey_key" ON "Conversation"("pairKey");

-- CreateIndex
CREATE INDEX "Conversation_lastMessageAt_idx" ON "Conversation"("lastMessageAt");

-- CreateIndex
CREATE INDEX "ConversationParticipant_userId_idx" ON "ConversationParticipant"("userId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Block_blockedId_idx" ON "Block"("blockedId");

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security for the chat tables (architecture.md §14.2).
--
-- Hand-written (Prisma Migrate does not manage RLS). These three tables are the
-- ONLY tables in the schema with RLS. Every write still goes through a server
-- action on the pooled `DATABASE_URL` role (`postgres`, which has BYPASSRLS),
-- so application authorization is unchanged. The policies below exist purely so
-- Supabase Realtime can safely stream rows to the browser (the `authenticated`
-- role), scoped to conversations the viewer participates in.
--
-- `auth.uid()` returns uuid; our id columns are text -> cast. Wrapped in a
-- scalar subselect so Postgres caches it as an initplan (Supabase perf guidance).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "Conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConversationParticipant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;

-- A participant can read their own membership rows (no self-join -> no RLS recursion).
CREATE POLICY "cp_select_own" ON "ConversationParticipant"
    FOR SELECT TO authenticated
    USING ("userId" = (SELECT auth.uid())::text);

-- A user can read a conversation they participate in.
CREATE POLICY "conversation_select_member" ON "Conversation"
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM "ConversationParticipant" p
        WHERE p."conversationId" = "Conversation"."id"
          AND p."userId" = (SELECT auth.uid())::text
    ));

-- A user can read messages in a conversation they participate in.
CREATE POLICY "message_select_member" ON "Message"
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM "ConversationParticipant" p
        WHERE p."conversationId" = "Message"."conversationId"
          AND p."userId" = (SELECT auth.uid())::text
    ));

-- No INSERT/UPDATE/DELETE policies: mutations run on the BYPASSRLS service role.
GRANT SELECT ON "Conversation", "ConversationParticipant", "Message" TO authenticated;

-- Realtime needs the full pre-image to evaluate RLS on UPDATE/DELETE events
-- (e.g. the inbox subscribing to ConversationParticipant.lastReadAt changes).
ALTER TABLE "ConversationParticipant" REPLICA IDENTITY FULL;
ALTER TABLE "Message" REPLICA IDENTITY FULL;

-- Add the chat tables to the Realtime publication (idempotent guard).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'Message'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE "Message";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ConversationParticipant'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE "ConversationParticipant";
    END IF;
END
$$;
