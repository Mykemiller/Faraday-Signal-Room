import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client using the service-role key.
 *
 * Used exclusively by server components / route handlers to read the live
 * `public.signals` feed and the taxonomy tables. Those reads are NOT available
 * to the anon role: `public.signals` has no anon SELECT policy (deny-all) and
 * `faraday_domains` is authenticated-only (verified 2026-07-24). Rather than
 * open those tables to public reads, the live feed is rendered on the server
 * with the service-role key, which never reaches the browser.
 *
 * NEVER import this from a "use client" module — it would leak the secret.
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
