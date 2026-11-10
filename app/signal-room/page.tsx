import { isSignalRoomLive } from "@/lib/signal-room/flags";
import { getRawFeed } from "@/lib/signal-room/feed-source";
import { SignalFeed } from "@/components/signal-room/SignalFeed";
import {
  buildTaxonomyIndex,
  enrichSignals,
  type DomainRow,
  type FeedSignal,
  type SubdomainRow,
  type ThemeRow,
} from "@/lib/signal-room/live-feed";

// Render at runtime (where the Supabase service-role env is present) rather than
// prerendering at build time with no keys. The database reads live in
// lib/signal-room/feed-source.ts and are cached for 5 minutes (Decision 1); the
// health endpoint reads the same cache, so it reports what this page serves.
export const dynamic = "force-dynamic";

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
