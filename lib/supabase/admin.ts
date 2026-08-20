import "server-only";

import { createClient } from "@supabase/supabase-js";

// Service-role client — bypasses RLS. Only for trusted server-side operations
// (e.g. issuing scoped Storage signed-upload URLs) where the caller's identity
// has already been checked. Never expose this client or the key to the browser.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
