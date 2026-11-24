// FDY-419 (ADM-1.7c) — the Faraday beta access gate, wired for Signal Room (app code SR,
// access_key "signalroom"). Follow-up to FDY-414.
//
// The gate itself is the vendored package in ./faraday-gate/ (byte-identical to
// Mykemiller/faraday-workbench/packages/faraday-gate; never edit it here — see its README and
// MANIFEST.sha256). This file is the app-side wrapper: config from this app's EXISTING env names,
// the enforce flag, and the one policy the package deliberately does not make for us.
//
// THE POLICY: if the estate_entitled probe errors (RPC missing, timeout, no/incorrect env), the
// package would show "unavailable". That must not close Signal Room. So an "error" answer PASSES
// THROUGH unless FARADAY_GATE_ENFORCE === "1", in which case it fails closed (the package's own
// behaviour). Only "error" is softened: a real denial (no_grant, expired, waitlist_mode, …) and
// "unknown_app" are always honoured.
//
// Pure apart from the injected guard/probe: no next/* imports, so vitest loads it directly.

import { guardRoute, type GuardResult } from "./faraday-gate/server/guard.ts";
import { appMode, type GateServerConfig } from "./faraday-gate/server/check.ts";
import type { Entitlement, GateCopy } from "./faraday-gate/core.ts";
import signalRoomCopy from "./faraday-gate/gate-copy/signalroom.json";

/** estate_entitled access_key for Signal Room (app code SR). */
export const SIGNALROOM_APP = "signalroom";
export const SIGNALROOM_APP_NAME = "Signal Room";
export const SIGNALROOM_GATE_COPY = signalRoomCopy as GateCopy;
/** Signal Room has no legal pages of its own; the gate links to the Faraday master Terms and Privacy. */
export const SIGNALROOM_TERMS_URL = "https://www.faraday-intelligence.ai/terms";
export const SIGNALROOM_PRIVACY_URL = "https://www.faraday-intelligence.ai/privacy";

/** The Faraday Supabase project of record. The gate check must hit THIS project. */
export const FARADAY_PROJECT_REF = "ycadmmngkdhvpcsrcuaq";

type Env = Record<string, string | undefined>;

/** True when a Supabase URL names the Faraday project of record. */
export function isFaradayProjectUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname.toLowerCase() === `${FARADAY_PROJECT_REF}.supabase.co`;
  } catch {
    return false;
  }
}

/**
 * Gate config from env names this app already uses (no new secret):
 * NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (server-only) for the check, and
 * NEXT_PUBLIC_SUPABASE_ANON_KEY (publishable) for the gate's own email one-time code.
 * A URL that is not the Faraday project yields an empty config, which the package answers with
 * reason "error" (so the enforce policy below decides: pass through unless enforced).
 */
export function gateConfig(env: Env = process.env): GateServerConfig {
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!isFaradayProjectUrl(url)) return { supabaseUrl: "", serviceKey: "", anonKey: undefined };
  return {
    supabaseUrl: url,
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined,
  };
}

/** FARADAY_GATE_ENFORCE === "1" turns a probe error into a closed gate. Anything else: pass through. */
export function gateEnforced(env: Env = process.env): boolean {
  return env.FARADAY_GATE_ENFORCE === "1";
}

export interface SignalRoomGuardResult extends GuardResult {
  /** True when the gate could not get an answer and let the visitor through (enforce off). */
  failOpen: boolean;
}

/** Apply the enforce policy to a package GuardResult. */
export function applyEnforcePolicy(g: GuardResult, enforce: boolean): SignalRoomGuardResult {
  if (!g.pass && g.entitlement.reason === "error" && !enforce) {
    return { ...g, pass: true, view: "pass", failOpen: true };
  }
  return { ...g, failOpen: false };
}

/** True when the Cookie header carries a Supabase Auth session cookie (sb-<ref>-auth-token[.N]). */
export function hasSupabaseAuthCookie(cookieHeader: string | null | undefined): boolean {
  if (!cookieHeader) return false;
  return cookieHeader.split(";").some((p) => {
    const i = p.indexOf("=");
    return i > 0 && /^sb-[^=]+-auth-token(?:\.\d+)?$/.test(p.slice(0, i).trim());
  });
}

const errorResult = (entitlement: Entitlement): GuardResult => ({
  pass: false, view: "unavailable", email: null, identitySource: "none", entitlement,
});

export interface GuardDeps {
  cfg?: GateServerConfig;
  enforce?: boolean;
  guard?: typeof guardRoute;
  probe?: typeof appMode;
}

/**
 * Guard the /signal-room route group.
 *
 * - `cookieHeader` is the raw Cookie header (the gate reads its own httpOnly fgate_at cookie from it).
 * - `appEmail` resolves the app's OWN verified sign-in email (Supabase Auth getUser on this app's
 *   session cookie). It is called only when the mode is not "open" AND a Supabase session cookie is
 *   present, so open mode makes exactly one (cached) probe and no identity lookup. If it yields no
 *   email, identity falls back to the gate's own fgate_at cookie (the package does this).
 *
 * Order: the mode probe runs first (cached 60 s on success). A probe error short-circuits to the
 * enforce policy without a second probe. Otherwise guardRoute() decides (its own probe is a cache hit).
 * Never throws: an unexpected exception is treated as a probe error and the same policy applies.
 */
export async function guardSignalRoom(
  opts: { cookieHeader?: string | null; appEmail?: (() => Promise<string | null>) | null },
  deps: GuardDeps = {},
): Promise<SignalRoomGuardResult> {
  const cfg = deps.cfg ?? gateConfig();
  const enforce = deps.enforce ?? gateEnforced();
  const guard = deps.guard ?? guardRoute;
  const probe = deps.probe ?? appMode;
  const cookieHeader = opts.cookieHeader ?? null;
  let g: GuardResult;
  try {
    const mode = await probe(SIGNALROOM_APP, cfg);
    if (!mode.allowed && mode.reason === "error") {
      g = errorResult(mode);
    } else {
      let appEmail: string | null = null;
      const isOpen = mode.allowed && mode.reason === "open";
      if (!isOpen && opts.appEmail && hasSupabaseAuthCookie(cookieHeader)) {
        try { appEmail = await opts.appEmail(); } catch { appEmail = null; }
      }
      g = await guard({ app: SIGNALROOM_APP, appEmail, cookieHeader }, cfg);
    }
  } catch {
    g = errorResult({ allowed: false, reason: "error", mode: null, role: null, grant_kind: null, expires_at: null });
  }
  return applyEnforcePolicy(g, enforce);
}
