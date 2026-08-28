import { redirect } from "next/navigation";

import { getOrCreateSettings } from "@/lib/actions/settings";
import { getOrCreateUser, getSupabaseUser } from "@/lib/actions/users";

import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const supabaseUser = await getSupabaseUser();
  if (!supabaseUser) redirect("/login");

  const [, settings] = await Promise.all([
    getOrCreateUser(),
    getOrCreateSettings(supabaseUser.id),
  ]);

  return (
    <main className="flex-1 flex items-center justify-center p-6 min-h-0" style={{ overflowY: "auto" }}>
      <div className="card elev-md" style={{ width: "100%", maxWidth: 420 }}>
        <h1 style={{ fontSize: 24, marginBottom: 4 }}>Settings</h1>
        <p className="text-muted" style={{ fontSize: 13, marginBottom: 22 }}>
          Controls how parks are found and how long check-ins last.
        </p>
        <SettingsForm settings={settings} />
      </div>
    </main>
  );
}
