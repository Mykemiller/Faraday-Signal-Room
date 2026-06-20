import type { Signal, SubscriberSignal } from "./types";

/**
 * The single chokepoint that strips `conviction` from any outbound Signal
 * payload (§4.3, §7.3, §10). This is defense-in-depth: the database
 * `subscriber_signals` VIEW is the hard guard (review item 3), this
 * serializer is the application-layer backstop.
 *
 * Implemented as an explicit allow-list so a future column added to the
 * base `signals` table can never silently leak through.
 */
// Accepts a typed Signal or any raw DB row; reads via an explicit allow-list.
type RawSignal = Signal | Record<string, unknown>;

export function toSubscriberSignal(signal: RawSignal): SubscriberSignal {
  const s = signal as Record<string, unknown>;
  return {
    id: s.id as string,
    fired_at: s.fired_at as string,
    source: s.source as string,
    theme_tags: (s.theme_tags as string[]) ?? [],
    domain_tags: (s.domain_tags as string[]) ?? [],
    subdomain_tags: (s.subdomain_tags as string[]) ?? [],
    company_tags: (s.company_tags as string[]) ?? [],
    framing: s.framing as string,
    byline: (s.byline as string | null) ?? null,
    faradays_take: (s.faradays_take as string | null) ?? null,
  };
}

export function toSubscriberSignals(signals: RawSignal[]): SubscriberSignal[] {
  return signals.map(toSubscriberSignal);
}

/**
 * Contract assertion used by tests and (optionally) at runtime: throws if a
 * payload still carries a conviction field. Cheap insurance against regressions.
 */
export function assertNoConviction(payload: unknown): void {
  const seen = new Set<unknown>();
  const walk = (value: unknown): void => {
    if (value === null || typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (key.toLowerCase() === "conviction") {
        throw new Error("conviction field present in subscriber-facing payload");
      }
      walk(child);
    }
  };
  walk(payload);
}
