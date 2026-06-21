import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSignalRoomLive } from "@/lib/signal-room/flags";
import { SignalRoom } from "@/components/signal-room/SignalRoom";
import type { Taxonomy } from "@/components/signal-room/types";

export const dynamic = "force-dynamic";

async function loadTaxonomy(): Promise<Taxonomy> {
  // Selection surfaces read the Postgres taxonomy mirror (§7.1). Reads are
  // allowed for everyone by the mirror's RLS policies (0001).
  try {
    const supabase = createSupabaseServerClient();
    const [themes, domains, subdomains, companies] = await Promise.all([
      supabase.from("faraday_themes").select("theme_code, name, tagline").eq("active", true),
      supabase.from("faraday_domains").select("domain_code, domain_name, emoji").eq("active", true),
      supabase
        .from("faraday_subdomains")
        .select("subdomain_code, domain_code, display_name")
        .eq("active", true),
      supabase.from("tracking_companies").select("company_id, name").eq("active", true),
    ]);
    return {
      themes: themes.data ?? [],
      domains: domains.data ?? [],
      subdomains: subdomains.data ?? [],
      companies: companies.data ?? [],
    };
  } catch {
    // Env not configured (e.g. local preview without keys) — render the shell
    // with an empty taxonomy rather than 500. Route still returns 200 (§11 P5).
    return { themes: [], domains: [], subdomains: [], companies: [] };
  }
}

export default async function SignalRoomPage() {
  const taxonomy = await loadTaxonomy();
  const live = isSignalRoomLive();

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      {!live && (
        <div className="mb-6 rounded-md border border-gold/40 bg-cream px-4 py-2 text-sm text-forest">
          <span className="eyebrow mr-2">Preview</span>
          This surface is gated behind <code>NEXT_PUBLIC_SIGNAL_ROOM_LIVE</code> and
          is not yet live.
        </div>
      )}

      <header className="mb-8">
        <p className="eyebrow">Faraday Intelligence</p>
        <h1 className="font-serif text-3xl font-semibold">Signal Room</h1>
        <p className="mt-2 max-w-2xl font-serif italic text-forest">
          From the grid and the foundry to the capital stack, Faraday follows every Theater, Sector, and Thread of the
          buildout — Signal by Signal.
        </p>
        <p className="mt-2 max-w-2xl text-forest/80">
          Compose your own intelligence subscription. Choose the Theaters, Sectors, Threads and
          companies you care about, set a cadence, and receive matching Signals.
        </p>
      </header>

      <SignalRoom taxonomy={taxonomy} />
    </main>
  );
}
