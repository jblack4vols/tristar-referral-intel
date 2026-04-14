import { createClient } from "@supabase/supabase-js";

// Server-only Supabase client using the SERVICE ROLE key.
// Bypasses RLS — never expose to the client.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars (URL or SERVICE_ROLE_KEY)");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
