import { unstable_cache } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSignalRoomLive } from "@/lib/signal-room/flags";
import {
  logQueryCounts,
  logQueryError,
  logSignalRoomConfig,
} from "@/lib/signal-room/diagnostics";
import { SignalFeed } from "@/components/signal-room/SignalFeed";
import {
  buildTaxonomyIndex,
  enrichSignals,
  type DomainRow,
  type FeedSignal,
  type RawSignal,
  type SubdomainRow,
  type ThemeRow,
} from "@/lib/signal-room/live-feed";

// Render at runtime (where the Supabase service-role env is present) rather than
// prerendering at build time with no keys. The database reads are cached for 5
// minutes via unstable_cache below (Decision 1) so we don't hit Postgres on
// every request — signal generation only runs once a day (07:30 UTC, AUTO-202).
export const dynamic = "force-dynamic";

const SIGNAL_LIMIT = 200; // Decision 2 — fetch newest 200, filter client-side.
const FEED_TTL_SECONDS = 300;

interface FeedData {
  ok: boolean;
  error: string | null;
  themes: ThemeRow[];
  domains: DomainRow[];
  subdomains: SubdomainRow[];
  signals: FeedSignal[];
}

const EMPTY: FeedData = {
  ok: false,
  error: null,
  themes: [],
  domains: [],
  subdomains: [],
  signals: [],
};

interface RawFeed {
  error: string | null;
  signals: RawSignal[];
  themes: ThemeRow[];
  domains: DomainRow[];
  subdomains: SubdomainRow[];
}

// The raw database reads, cached for 5 minutes across requests (Decision 1).
const getRawFeed = unstable_cache(
  async (): Promise<RawFeed> => {
    logSignalRoomConfig();

    let supabase: ReturnType<typeof createSupabaseAdminClient>;
    try {
      supabase = createSupabaseAdminClient();
    } catch (err) {
      // Env not configured (e.g. local/preview without keys). Previously this
      // was swallowed entirely — say which env var is missing (name only).
      console.error("[signal-room] client construction failed", {
        message: err instanceof Error ? err.message : String(err),
      });
      return { error: "not_configured", signals: [], themes: [], domains: [], subdomains: [] };
    }

    const [signalsRes, themesRes, domainsRes, subdomainsRes] = await Promise.all([
      supabase
        .from("signals")
        .select(
          "id, fired_at, source, theme_tags, domain_tags, subdomain_tags, company_tags, conviction, framing, byline, faradays_take",
        )
        .order("fired_at", { ascending: false })
        .limit(SIGNAL_LIMIT),
      supabase.from("faraday_themes").select("theme_code, name, tagline").eq("active", true).order("theme_code"),
      supabase
        .from("faraday_domains")
        .select("domain_code, domain_num, domain_name, emoji")
        .eq("active", true)
        .order("domain_num"),
      supabase
        .from("faraday_subdomains")
        .select("subdomain_code, domain_code, display_name, theme_tags")
        .eq("active", true)
        .order("subdomain_code"),
    ]);

    // Log EVERY failing query in full before deciding what the visitor sees.
    // supabase-js resolves rather than throwing, so this is the only place the
    // PostgREST message/code/details/hint exist at all.
    const failures = [
      logQueryError("signals", "select", signalsRes.error),
      logQueryError("faraday_themes", "select", themesRes.error),
      logQueryError("faraday_domains", "select", domainsRes.error),
      logQueryError("faraday_subdomains", "select", subdomainsRes.error),
    ].filter(Boolean).length;

    // Counts on success too (Decision 3): an RLS denial is `error: null` with
    // `data: []`, so silent emptiness is the likelier failure than an exception.
    logQueryCounts(
      {
        signals: signalsRes.data?.length ?? 0,
        themes: themesRes.data?.length ?? 0,
        domains: domainsRes.data?.length ?? 0,
        subdomains: subdomainsRes.data?.length ?? 0,
      },
      { failedQueries: failures, cached: false },
    );

    if (failures > 0) {
      return { error: "query_failed", signals: [], themes: [], domains: [], subdomains: [] };
    }

    return {
      error: null,
      signals: (signalsRes.data ?? []) as RawSignal[],
      themes: (themesRes.data ?? []) as ThemeRow[],
      domains: (domainsRes.data ?? []) as DomainRow[],
      subdomains: (subdomainsRes.data ?? []) as SubdomainRow[],
    };
  },
  ["signal-room-live-feed-v1"],
  { revalidate: FEED_TTL_SECONDS, tags: ["signal-room-feed"] },
);

async function loadFeed(): Promise<FeedData> {
  const raw = await getRawFeed();

  // Emitted on EVERY render, including cache hits — the counts above only fire
  // on a cache miss, so without this a stale cached failure would look silent
  // for up to FEED_TTL_SECONDS.
  console.error("[signal-room] render", {
    error: raw.error,
    signals: raw.signals.length,
    themes: raw.themes.length,
    domains: raw.domains.length,
    subdomains: raw.subdomains.length,
  });

  if (raw.error) return { ...EMPTY, error: raw.error };

  const index = buildTaxonomyIndex(raw.themes, raw.domains, raw.subdomains);
  const signals = enrichSignals(raw.signals, index);

  return {
    ok: true,
    error: null,
    themes: raw.themes,
    domains: raw.domains,
    subdomains: raw.subdomains,
    signals,
  };
}

export default async function SignalRoomPage() {
  const data = await loadFeed();
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
          From the grid and the foundry to the capital stack, Faraday follows every
          Theater, Sector, and Thread of the buildout — Signal by Signal.
        </p>
        <p className="mt-2 max-w-2xl text-forest/80">
          Every Signal Faraday has fired, newest first. Filter by Theater, Sector and
          Thread to focus the feed.
        </p>
      </header>

      <SignalFeed
        themes={data.themes}
        domains={data.domains}
        subdomains={data.subdomains}
        signals={data.signals}
        error={data.error}
      />
    </main>
  );
}
