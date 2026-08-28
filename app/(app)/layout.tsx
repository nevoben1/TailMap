import { redirect } from "next/navigation";

import { Nav } from "@/components/nav";
import { getOrCreateUser } from "@/lib/actions/users";
import { getUnreadTotal } from "@/lib/chat";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getOrCreateUser();
  if (!user) redirect("/login");

  const unreadCount = await getUnreadTotal(user.id);

  return (
    <div className="flex flex-col overflow-hidden" style={{ height: "100vh" }}>
      <Nav avatarInitial={user.avatarInitial} meId={user.id} unreadCount={unreadCount} />
      {children}
    </div>
  );
}
