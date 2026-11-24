// FDY-419 — Signal Room's OWN verified sign-in email, for the Faraday gate (server only).
//
// Signal Room has no sign-in page today, but its configurator APIs read a Supabase Auth session
// from this app's cookies (lib/supabase/server.ts). When such a session exists, the gate prefers
// its email over the gate's own one-time-code cookie. getUser() verifies the token with Supabase
// Auth (not just a cookie decode). Read-only: cookies are never written from here. Any failure,
// missing env, a URL that is not the Faraday project, or an unconfirmed email → null.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isFaradayProjectUrl } from "@/lib/faradayGate";

export async function signalRoomAppEmail(): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey || !isFaradayProjectUrl(url)) return null;
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // read-only: the gate never refreshes or writes this app's session cookies
        },
      },
    });
    const { data, error } = await supabase.auth.getUser();
    const user = data?.user;
    if (error || !user?.email || !user.email_confirmed_at) return null;
    return user.email;
  } catch {
    return null;
  }
}
