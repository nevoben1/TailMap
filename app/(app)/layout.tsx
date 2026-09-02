import { redirect } from "next/navigation";

import { Nav } from "@/components/nav";
import { getOrCreateUser } from "@/lib/actions/users";
import { getUnreadTotal } from "@/lib/chat";
import { seedDemoConversation } from "@/lib/demo-seed";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getOrCreateUser();
  if (!user) redirect("/login");

  // Demo-mode only, and a no-op after the first run (see lib/demo-seed.ts).
  // Ahead of the unread count so the badge reflects it on the very first render.
  await seedDemoConversation(user.id);

  const unreadCount = await getUnreadTotal(user.id);

  return (
    <div className="flex flex-col overflow-hidden" style={{ height: "100vh" }}>
      <Nav avatarInitial={user.avatarInitial} meId={user.id} unreadCount={unreadCount} />
      {children}
    </div>
  );
}
