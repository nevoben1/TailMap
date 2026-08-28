import { redirect } from "next/navigation";

import { Nav } from "@/components/nav";
import { getOrCreateUser } from "@/lib/actions/users";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getOrCreateUser();
  if (!user) redirect("/login");

  return (
    <div className="flex flex-col overflow-hidden" style={{ height: "100vh" }}>
      <Nav avatarInitial={user.avatarInitial} />
      {children}
    </div>
  );
}
