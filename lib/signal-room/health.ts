// Signal Room health — pure summary of the cached feed read.
//
// Consumed by the surfaces that link here (the Faraday Intelligence home-page
// tile and the Workbench Signal Room tile) so neither has to assert "Live" on
// faith. Counts and a timestamp only: no Signal content, no conviction, no
// taxonomy names, no error detail. PostgREST messages stay in the server log.

export type HealthStatus = "ok" | "empty" | "not_configured" | "query_failed";

export interface HealthInput {
  error: string | null;
  signals: { fired_at: string }[];
  themes: unknown[];
  domains: unknown[];
  subdomains: unknown[];
}

export interface SignalRoomHealth {
  /** True only when the page would render a populated, filterable feed. */
  ok: boolean;
  status: HealthStatus;
  /** NEXT_PUBLIC_SIGNAL_ROOM_LIVE — false means the Preview banner is showing. */
  live: boolean;
  /** Signals in the served window (newest `window` rows). */
  signals: number;
  /** Of those, how many fired in the rolling 24 hours before `checkedAt`. */
  last24h: number;
  /** fired_at of the newest served Signal, or null. */
  newestFiredAt: string | null;
  /** Size of the served window, so a reader can tell a count from a cap. */
  window: number;
  checkedAt: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function buildHealth(
  raw: HealthInput,
  opts: { nowMs: number; live: boolean; window: number },
): SignalRoomHealth {
  const times = raw.signals
    .map((s) => Date.parse(s.fired_at))
    .filter((t) => Number.isFinite(t));
  const newest = times.length ? Math.max(...times) : null;
  const cutoff = opts.nowMs - DAY_MS;

  let status: HealthStatus;
  if (raw.error === "not_configured") status = "not_configured";
  else if (raw.error) status = "query_failed";
  else if (
    raw.signals.length === 0 ||
    raw.themes.length === 0 ||
    raw.domains.length === 0 ||
    raw.subdomains.length === 0
  ) {
    // Reads succeeded but something the page needs is empty. An RLS denial
    // looks exactly like this (`error: null`, `data: []`), so it is not "ok".
    status = "empty";
  } else status = "ok";

  const healthy = status === "ok";
  return {
    ok: healthy,
    status,
    live: opts.live,
    signals: healthy ? raw.signals.length : 0,
    last24h: healthy ? times.filter((t) => t >= cutoff).length : 0,
    newestFiredAt: healthy && newest !== null ? new Date(newest).toISOString() : null,
    window: opts.window,
    checkedAt: new Date(opts.nowMs).toISOString(),
  };
}
