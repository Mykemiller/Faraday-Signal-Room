// Signal Room observability (CC-FSR-OBSERVABILITY-1.0).
//
// The live feed previously rendered "We couldn't load Signals right now" while
// returning HTTP 200 and logging NOTHING — the Supabase error was caught and
// discarded, so the failure was undiagnosable from outside the code. These
// helpers make every failure (and every success) visible in Vercel runtime
// logs without changing a single character of visitor-facing copy.
//
// Two rules that shaped this module:
//
//  1. SECRETS ARE NEVER LOGGED. We log the *role claim* decoded from the JWT
//     payload and the key *length* — never the key, never a prefix or suffix
//     of it. `roleClaim()` reads only the `role` field out of the decoded
//     payload; nothing else from the token is ever emitted.
//
//  2. supabase-js RESOLVES, IT DOES NOT THROW. A `{ data, error }` pair means a
//     bare try/catch captures nothing. Worse, an RLS denial is usually not an
//     error at all — it surfaces as `error: null` with `data: []`. So we log
//     row counts on success too: silent emptiness is the more likely failure
//     mode here and a count line turns "did it work?" into one grep.
//
// `console.error` (not `console.log`) throughout: Vercel captures both, but
// error level is filterable and survives log-level configuration.

/**
 * Decode the `role` claim of a Supabase JWT without validating or logging it.
 *
 * Returns a coarse descriptor, never key material:
 *   - "service_role" — a genuine service-role key (bypasses RLS)
 *   - "anon"         — the legacy anon key (subject to RLS)
 *   - "NOT_A_JWT (publishable/secret format?)" — an `sb_publishable_…` /
 *     `sb_secret_…` key, which is not a JWT and carries no role claim
 *   - "MISSING" / "NO_ROLE_CLAIM" / "UNDECODABLE"
 */
export function roleClaim(key?: string): string {
  if (!key) return "MISSING";
  if (!key.startsWith("eyJ")) return "NOT_A_JWT (publishable/secret format?)";
  try {
    const payload = key.split(".")[1];
    if (!payload) return "UNDECODABLE";
    const json = decodeBase64Url(payload);
    const claims = JSON.parse(json) as { role?: unknown };
    return typeof claims.role === "string" ? claims.role : "NO_ROLE_CLAIM";
  } catch {
    return "UNDECODABLE";
  }
}

/** base64url → utf-8, working under both the Node and Edge runtimes. */
function decodeBase64Url(input: string): string {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  if (typeof atob === "function") {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  // Node fallback (older runtimes without a global atob).
  return Buffer.from(padded, "base64").toString("utf8");
}

let configLogged = false;

/**
 * One-time (per cold start) assertion of which env vars are present and what
 * the key in SUPABASE_SERVICE_ROLE_KEY actually is. Presence and role only.
 *
 * This is the line that settles the leading hypothesis: a genuine service-role
 * key decodes to "service_role" and bypasses RLS; the anon key decodes to
 * "anon" and is denied by `signals` (RLS, zero policies) and `faraday_domains`
 * (authenticated-only); an `sb_publishable_…` key is not a JWT at all.
 */
export function logSignalRoomConfig(): void {
  if (configLogged) return;
  configLogged = true;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  console.error("[signal-room] config", {
    url: url ?? "MISSING", // the project URL is not a secret
    urlHasTrailingSlash: url ? url.endsWith("/") : null,
    liveFlag: process.env.NEXT_PUBLIC_SIGNAL_ROOM_LIVE ?? "MISSING",
    serviceKeyPresent: Boolean(serviceKey),
    serviceKeyRole: roleClaim(serviceKey),
    serviceKeyLength: serviceKey?.length ?? 0,
    anonKeyPresent: Boolean(anonKey),
    anonKeyRole: roleClaim(anonKey),
    anonKeyLength: anonKey?.length ?? 0,
    vercelEnv: process.env.VERCEL_ENV ?? null,
  });
}

/** The `error` half of a supabase-js `{ data, error }` result. */
export interface SupabaseErrorLike {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
}

/**
 * Log a failed query with everything PostgREST gave us. Returns true when an
 * error was present, so callers can read as `if (logQueryError(...)) { … }`.
 */
export function logQueryError(
  table: string,
  op: string,
  error: SupabaseErrorLike | null | undefined,
): boolean {
  if (!error) return false;
  console.error("[signal-room] query failed", {
    table,
    op,
    message: error.message ?? null,
    code: error.code ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
  });
  return true;
}

/**
 * Log the row count each table returned. An RLS denial reads as a successful
 * empty result, so this is the line that catches a partial failure where one
 * table silently comes back with nothing.
 */
export function logQueryCounts(
  counts: Record<string, number>,
  context: Record<string, unknown> = {},
): void {
  console.error("[signal-room] query counts", { ...counts, ...context });
}
