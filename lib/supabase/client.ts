import { createBrowserClient } from "@supabase/ssr";

/** Browser Supabase client (anon key only — never a secret, §7.1). */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createBrowserClient(url, anonKey);
}
