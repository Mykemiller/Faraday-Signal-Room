import { createHmac, randomBytes } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Daily usage limits (FDY-394 · UL-4), Signal Room copy of the estate-wide
 * helper described in the FDY-353 prompt §3.
 *
 * SERVER-SIDE ONLY. It calls public.usage_consume with the service-role client
 * (the function is not executable by anon/authenticated). Never import this
 * from a "use client" module.
 *
 * What counts in Signal Room (D3): each distinct signal configuration rule id
 * created or changed per UTC day. Pausing, resuming, cancelling, deleting or
 * reordering never calls this.
 *
 * Failure mode (D8): fail closed. RPC error, timeout (1.5 s), a malformed
 * answer or a missing service-role key all refuse the save.
 *
 * The limit itself lives in the database (app_setting_def / app_setting_value,
 * `SR daily_limit_signal_settings`, tunable from the Workbench). The kill
 * switch is `SR usage_limits_mode` (enforce | record_only | off).
 */

export const USAGE_APP = "SR";
export const SIGNAL_SETTINGS_METRIC = "signal_settings";
export const USAGE_RPC_TIMEOUT_MS = 1500;

/** First-party visitor cookie (same shape as Live Agent's la_vid). */
export const VISITOR_COOKIE = "sr_vid";
export const VISITOR_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 34_560_000, // 400 days
};

/** The wrong Supabase project: usage code must never run against it (§0). */
const FORBIDDEN_PROJECT_REF = "xgbpmlkanxewtfizloay";

/** usage_consume caps p_weight at 10. */
const MAX_WEIGHT = 10;

export type UsageReason =
  | "ok"
  | "already_counted"
  | "limit"
  | "unconfigured"
  | "off"
  | "bypass"
  | "bad_input"
  | "error";

export interface UsageResult {
  allowed: boolean;
  /** Next reset as an ISO timestamp (UTC midnight, D6). */
  resetAt: string;
  reason: UsageReason;
}

export interface UsageIdentity {
  /** `p:<estate_people.id>` or `v:<sr_vid>`. */
  subject: string;
  /** `ip:<hmac>` for anonymous subjects when USAGE_IP_SALT is set (D5). */
  ipSubject: string | null;
  /** A visitor id minted for this request; the caller must set the cookie. */
  newVisitorId: string | null;
}

export interface UsageConsumeArgs {
  p_app: string;
  p_metric: string;
  p_subject: string;
  p_item: string | null;
  p_weight: number;
  p_ip_subject: string | null;
  p_dry_run: boolean;
}

export type UsageRpc = (
  args: UsageConsumeArgs,
  signal: AbortSignal,
) => Promise<{ data: unknown; error: unknown }>;

export interface UsageDeps {
  /** Injected in tests; defaults to the service-role client's rpc. */
  rpc?: UsageRpc;
  timeoutMs?: number;
  now?: () => Date;
}

// ---------------------------------------------------------------------------
// Subject resolution (D4, D5)
// ---------------------------------------------------------------------------

const VISITOR_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 128-bit base64url visitor id (22 characters). */
export function newVisitorId(): string {
  return randomBytes(16).toString("base64url");
}

/** First hop of x-forwarded-for (Vercel sets it), else x-real-ip. */
export function clientIp(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  if (first) return first;
  const real = headers.get("x-real-ip")?.trim();
  return real || null;
}

/** `ip:` + first 32 hex of HMAC-SHA256(ip, salt). Raw IPs are never stored. */
export function ipSubjectFor(ip: string | null, salt: string | undefined): string | null {
  if (!ip || !salt) return null;
  return `ip:${createHmac("sha256", salt).update(ip).digest("hex").slice(0, 32)}`;
}

let warnedNoSalt = false;

export function usageIdentity(input: {
  personId: string | null;
  visitorCookie: string | undefined;
  headers: Headers;
  salt?: string;
}): UsageIdentity {
  if (input.personId && UUID_RE.test(input.personId)) {
    // Known person: one subject across devices; no IP check (anonymous only).
    return { subject: `p:${input.personId}`, ipSubject: null, newVisitorId: null };
  }

  const existing =
    input.visitorCookie && VISITOR_ID_RE.test(input.visitorCookie) ? input.visitorCookie : null;
  const visitorId = existing ?? newVisitorId();

  if (!input.salt && !warnedNoSalt) {
    warnedNoSalt = true;
    console.warn("[signal-room] usage: USAGE_IP_SALT is not set; skipping the IP check (D5)");
  }

  return {
    subject: `v:${visitorId}`,
    ipSubject: ipSubjectFor(clientIp(input.headers), input.salt),
    newVisitorId: existing ? null : visitorId,
  };
}

/** Minimal shape of the service-role client used for the person lookup. */
interface PersonLookupClient {
  from(table: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/**
 * The signed-in user's estate person id, or null. Order:
 *  1. estate_people.auth_user_id = auth user id (the canonical link);
 *  2. subscribers.person_id for the user's email, ONLY when Supabase Auth has
 *     confirmed that email. An unconfirmed email must never map to a person,
 *     because a `p:` subject can carry the Workbench owner bypass (D9).
 * Any error returns null (the caller then counts by visitor cookie).
 */
export async function resolvePersonId(
  client: PersonLookupClient,
  user: { id: string; email?: string | null; email_confirmed_at?: string | null },
): Promise<string | null> {
  try {
    const byAuth = await client
      .from("estate_people")
      .select("id")
      .eq("auth_user_id", user.id)
      .limit(1)
      .maybeSingle();
    if (!byAuth.error && byAuth.data?.id) return String(byAuth.data.id);

    const email = user.email?.trim().toLowerCase();
    if (!email || !user.email_confirmed_at) return null;

    const bySub = await client
      .from("subscribers")
      .select("person_id")
      .eq("email", email)
      .not("person_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (!bySub.error && bySub.data?.person_id) return String(bySub.data.person_id);
  } catch (err) {
    console.error("[signal-room] usage: person lookup failed", (err as Error)?.message);
  }
  return null;
}

// ---------------------------------------------------------------------------
// consume()
// ---------------------------------------------------------------------------

export function nextUtcMidnight(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return d.toISOString();
}

function defaultRpc(): UsageRpc {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (url.includes(FORBIDDEN_PROJECT_REF)) {
    throw new Error("usage limits refuse this Supabase project");
  }
  const admin = createSupabaseAdminClient();
  return async (args, signal) => {
    const { data, error } = await admin.rpc("usage_consume", args).abortSignal(signal);
    return { data, error };
  };
}

const KNOWN_REASONS = new Set<UsageReason>([
  "ok",
  "already_counted",
  "limit",
  "unconfigured",
  "off",
  "bypass",
  "bad_input",
]);

/**
 * Check-and-consume one unit (or `weight` units) of a daily metric.
 * Returns { allowed, resetAt, reason }. Never throws; fails closed.
 */
export async function consume(
  opts: { metric: string; item?: string | null; weight?: number; dryRun?: boolean },
  identity: UsageIdentity,
  deps: UsageDeps = {},
): Promise<UsageResult> {
  const now = deps.now ?? (() => new Date());
  const timeoutMs = deps.timeoutMs ?? USAGE_RPC_TIMEOUT_MS;
  const denied = (reason: UsageReason): UsageResult => ({
    allowed: false,
    resetAt: nextUtcMidnight(now()),
    reason,
  });

  let rpc: UsageRpc;
  try {
    rpc = deps.rpc ?? defaultRpc();
  } catch (err) {
    console.error("[signal-room] usage: no service client, failing closed", (err as Error)?.message);
    return denied("error");
  }

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve("timeout");
    }, timeoutMs);
  });

  try {
    const outcome = await Promise.race([
      rpc(
        {
          p_app: USAGE_APP,
          p_metric: opts.metric,
          p_subject: identity.subject,
          p_item: opts.item ?? null,
          p_weight: Math.min(Math.max(1, Math.trunc(opts.weight ?? 1)), MAX_WEIGHT),
          p_ip_subject: identity.ipSubject,
          p_dry_run: opts.dryRun ?? false,
        },
        controller.signal,
      ),
      timeout,
    ]);

    if (outcome === "timeout") {
      console.error("[signal-room] usage: usage_consume timed out, failing closed");
      return denied("error");
    }
    if (outcome.error) {
      console.error("[signal-room] usage: usage_consume error, failing closed", outcome.error);
      return denied("error");
    }

    const data = outcome.data as Record<string, unknown> | null;
    if (!data || typeof data !== "object" || typeof data.allowed !== "boolean") {
      console.error("[signal-room] usage: malformed usage_consume answer, failing closed");
      return denied("error");
    }

    const reason = KNOWN_REASONS.has(data.reason as UsageReason)
      ? (data.reason as UsageReason)
      : data.allowed
        ? "ok"
        : "error";
    const resetAt =
      typeof data.reset_at === "string" && !Number.isNaN(Date.parse(data.reset_at))
        ? new Date(data.reset_at).toISOString()
        : nextUtcMidnight(now());

    return { allowed: data.allowed === true, resetAt, reason };
  } catch (err) {
    console.error("[signal-room] usage: usage_consume threw, failing closed", (err as Error)?.message);
    return denied("error");
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Gate a save that creates or changes the given signal configuration rules.
 * Call BEFORE any write; if it returns allowed=false, write nothing.
 *
 * 1. For brand-new rules (the create path, `allNew`), a pre-flight dry run
 *    for the whole batch (weight = rule count, capped at 10), so a batch that
 *    cannot fit is refused without spending anything. An edit path should
 *    pass allNew=false: some ids may already be counted today and are free.
 * 2. Consume each rule id as a distinct item. Re-saving a rule already
 *    counted today is free (`already_counted`). If one is refused (a race,
 *    or a batch over 10), the save is refused and nothing is written.
 */
export async function consumeRuleWrites(
  ruleIds: string[],
  identity: UsageIdentity,
  deps: UsageDeps = {},
  { allNew = true }: { allNew?: boolean } = {},
): Promise<UsageResult> {
  const now = deps.now ?? (() => new Date());
  if (ruleIds.length === 0) {
    return { allowed: true, resetAt: nextUtcMidnight(now()), reason: "ok" };
  }

  let last: UsageResult = { allowed: true, resetAt: nextUtcMidnight(now()), reason: "ok" };
  if (allNew) {
    last = await consume(
      { metric: SIGNAL_SETTINGS_METRIC, weight: Math.min(ruleIds.length, MAX_WEIGHT), dryRun: true },
      identity,
      deps,
    );
    if (!last.allowed) return last;
  }

  for (const id of ruleIds) {
    last = await consume({ metric: SIGNAL_SETTINGS_METRIC, item: id }, identity, deps);
    if (!last.allowed) return last;
  }
  return last;
}
