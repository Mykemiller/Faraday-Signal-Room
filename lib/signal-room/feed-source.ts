// The one server-side read of the live Signal feed (CC-FSR-LIVEWIRE-1.0).
//
// Shared by the page (app/signal-room/page.tsx) and the health endpoint
// (app/api/signal-room/health/route.ts) so that "is the Signal Room up?" is
// answered from the SAME cached read the visitor is served — a health check
// with its own query could report green while the page renders the error card.
//
// Server-only: this imports the service-role client. Never import it from a
// "use client" module.
import { unstable_cache } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  logQueryCounts,
  logQueryError,
  logSignalRoomConfig,
} from "@/lib/signal-room/diagnostics";
import type {
  DomainRow,
  RawSignal,
  SubdomainRow,
  ThemeRow,
} from "@/lib/signal-room/live-feed";

export const SIGNAL_LIMIT = 200; // Decision 2 — fetch newest 200, filter client-side.
export const FEED_TTL_SECONDS = 300;

export interface RawFeed {
  error: string | null;
  signals: RawSignal[];
  themes: ThemeRow[];
  domains: DomainRow[];
  subdomains: SubdomainRow[];
}

// The raw database reads, cached for 5 minutes across requests (Decision 1).
// Signal generation only runs once a day (07:30 UTC, AUTO-202).
export const getRawFeed = unstable_cache(
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
