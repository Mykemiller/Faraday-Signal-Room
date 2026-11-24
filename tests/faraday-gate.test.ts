// FDY-419 (ADM-1.7c) — the Signal Room wiring of the Faraday beta access gate.
// No network: every fetch is injected.
import { describe, expect, test } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  SIGNALROOM_APP, SIGNALROOM_GATE_COPY, applyEnforcePolicy, gateConfig, gateEnforced, guardSignalRoom,
  hasSupabaseAuthCookie, isFaradayProjectUrl,
} from "@/lib/faradayGate";
import { clearGateCache, type GateServerConfig } from "@/lib/faraday-gate/server/check.ts";
import { containsCountClaim, containsPrice, type Entitlement } from "@/lib/faraday-gate/core.ts";
import type { GuardResult } from "@/lib/faraday-gate/server/guard.ts";

const ROOT = path.resolve(__dirname, "..");
const VENDOR = path.join(ROOT, "lib", "faraday-gate");
const URL_ = "https://ycadmmngkdhvpcsrcuaq.supabase.co";

function fakeFetch(handler: (url: string, body: Record<string, unknown> | null) => unknown) {
  const calls: { url: string; body: Record<string, unknown> | null }[] = [];
  const f = (async (url: string, init: RequestInit = {}) => {
    const body = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, body });
    const out = handler(url, body);
    if (out instanceof Response) return out;
    return new Response(JSON.stringify(out), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return { f, calls };
}
const cfg = (f: typeof fetch): GateServerConfig => ({ supabaseUrl: URL_, serviceKey: "svc", anonKey: "anon", fetchImpl: f });
const missingRpc = () => new Response(JSON.stringify({ code: "PGRST202", message: "Could not find the function" }), { status: 404 });

describe("config + flag", () => {
  test("gateConfig reads the app's existing env names", () => {
    const c = gateConfig({ NEXT_PUBLIC_SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: "svc", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" });
    expect(c).toEqual({ supabaseUrl: URL_, serviceKey: "svc", anonKey: "anon" });
    expect(gateConfig({})).toEqual({ supabaseUrl: "", serviceKey: "", anonKey: undefined });
  });

  test("a URL that is not the Faraday project yields an empty (error) config", () => {
    for (const u of ["https://xgbpmlkanxewtfizloay.supabase.co", "https://example.com", "not a url", "https://ycadmmngkdhvpcsrcuaq.supabase.co.evil.test"]) {
      expect(isFaradayProjectUrl(u)).toBe(false);
      expect(gateConfig({ NEXT_PUBLIC_SUPABASE_URL: u, SUPABASE_SERVICE_ROLE_KEY: "svc" }).serviceKey).toBe("");
    }
    expect(isFaradayProjectUrl(URL_ + "/")).toBe(true);
  });

  test('FARADAY_GATE_ENFORCE is on only for the exact string "1"', () => {
    expect(gateEnforced({ FARADAY_GATE_ENFORCE: "1" })).toBe(true);
    for (const v of [undefined, "", "0", "true", "yes", " 1"]) expect(gateEnforced({ FARADAY_GATE_ENFORCE: v })).toBe(false);
  });

  test("Supabase session cookie detection", () => {
    expect(hasSupabaseAuthCookie(null)).toBe(false);
    expect(hasSupabaseAuthCookie("fgate_at=tok; other=1")).toBe(false);
    expect(hasSupabaseAuthCookie("a=1; sb-ycadmmngkdhvpcsrcuaq-auth-token=xyz")).toBe(true);
    expect(hasSupabaseAuthCookie("sb-ycadmmngkdhvpcsrcuaq-auth-token.0=xyz")).toBe(true);
    expect(hasSupabaseAuthCookie("sb-auth-token")).toBe(false);
  });
});

const ent = (e: Partial<Entitlement>): Entitlement => ({ allowed: false, reason: "error", mode: null, role: null, grant_kind: null, expires_at: null, ...e });
const res = (e: Entitlement, view: GuardResult["view"], pass = false): GuardResult => ({ pass, entitlement: e, view, email: null, identitySource: "none" });

describe("enforce policy", () => {
  test("probe error passes through when enforce is off, closes when on", () => {
    const g = res(ent({ reason: "error" }), "unavailable");
    const soft = applyEnforcePolicy(g, false);
    expect([soft.pass, soft.view, soft.failOpen]).toEqual([true, "pass", true]);
    const hard = applyEnforcePolicy(g, true);
    expect([hard.pass, hard.view, hard.failOpen]).toEqual([false, "unavailable", false]);
  });

  test("real denials are never softened, enforce or not", () => {
    for (const [reason, view] of [["no_grant", "request"], ["expired", "expired"], ["waitlist_mode", "waitlist"], ["unknown_app", "unavailable"], ["revoked", "request"]] as const) {
      for (const enforce of [false, true]) {
        const out = applyEnforcePolicy(res(ent({ reason, mode: "invite" }), view), enforce);
        expect(out.pass).toBe(false);
        expect(out.failOpen).toBe(false);
      }
    }
  });

  test("a pass stays a pass and is not flagged fail-open", () => {
    const out = applyEnforcePolicy(res(ent({ allowed: true, reason: "open", mode: "open" }), "pass", true), true);
    expect([out.pass, out.failOpen]).toEqual([true, false]);
  });
});

describe("end to end through the vendored guard (injected fetch)", () => {
  test("open mode: one probe for app 'signalroom', no identity lookup, no app-email call, pass", async () => {
    clearGateCache();
    const { f, calls } = fakeFetch(() => ({ allowed: true, reason: "open", mode: "open" }));
    let appEmailCalls = 0;
    const g = await guardSignalRoom(
      { cookieHeader: "fgate_at=tok; sb-ycadmmngkdhvpcsrcuaq-auth-token=s", appEmail: async () => { appEmailCalls++; return "a@b.co"; } },
      { cfg: cfg(f), enforce: true },
    );
    expect([g.pass, g.failOpen, g.email]).toEqual([true, false, null]);
    expect(calls.length).toBe(1); // guardRoute's own probe is a cache hit
    expect(calls[0].url).toMatch(/\/rest\/v1\/rpc\/estate_entitled$/);
    expect(calls[0].body).toEqual({ p_email: null, p_app: SIGNALROOM_APP });
    expect(appEmailCalls).toBe(0);
  });

  test("RPC missing → pass through by default, with a single probe", async () => {
    clearGateCache();
    const { f, calls } = fakeFetch(missingRpc);
    const g = await guardSignalRoom({ cookieHeader: null }, { cfg: cfg(f), enforce: false });
    expect([g.pass, g.failOpen, g.entitlement.reason]).toEqual([true, true, "error"]);
    expect(calls.length).toBe(1);
  });

  test("RPC missing with FARADAY_GATE_ENFORCE=1 → closed (unavailable)", async () => {
    clearGateCache();
    const { f } = fakeFetch(missingRpc);
    const g = await guardSignalRoom({ cookieHeader: null }, { cfg: cfg(f), enforce: true });
    expect([g.pass, g.view]).toEqual([false, "unavailable"]);
  });

  test("no Supabase env at all → error → pass through unless enforced", async () => {
    clearGateCache();
    const empty = gateConfig({});
    expect((await guardSignalRoom({}, { cfg: empty, enforce: false })).pass).toBe(true);
    expect((await guardSignalRoom({}, { cfg: empty, enforce: true })).pass).toBe(false);
  });

  test("invite mode, signed out → request view (gate shown)", async () => {
    clearGateCache();
    const { f } = fakeFetch(() => ({ allowed: false, reason: "no_grant", mode: "invite" }));
    const g = await guardSignalRoom({ cookieHeader: null }, { cfg: cfg(f), enforce: false });
    expect([g.pass, g.view]).toEqual([false, "request"]);
  });

  test("invite mode, gate cookie with a grant → pass, identity from the gate", async () => {
    clearGateCache();
    const { f } = fakeFetch((url, body) => {
      if (url.endsWith("/auth/v1/user")) return { email: "Reader@Example.com" };
      return body?.p_email ? { allowed: true, reason: "grant", mode: "invite", grant_kind: "demo" } : { allowed: false, reason: "no_grant", mode: "invite" };
    });
    const g = await guardSignalRoom({ cookieHeader: "other=1; fgate_at=tok" }, { cfg: cfg(f), enforce: true });
    expect([g.pass, g.email, g.identitySource]).toEqual([true, "reader@example.com", "gate"]);
  });

  test("invite mode, app's own verified email wins over the gate cookie", async () => {
    clearGateCache();
    const { f, calls } = fakeFetch((url, body) => {
      if (url.endsWith("/auth/v1/user")) return { email: "gate@example.com" };
      return body?.p_email === "member@example.com" ? { allowed: true, reason: "grant", mode: "invite" } : { allowed: false, reason: "no_grant", mode: "invite" };
    });
    const g = await guardSignalRoom(
      { cookieHeader: "fgate_at=tok; sb-ycadmmngkdhvpcsrcuaq-auth-token=s", appEmail: async () => "Member@Example.com" },
      { cfg: cfg(f), enforce: true },
    );
    expect([g.pass, g.email, g.identitySource]).toEqual([true, "member@example.com", "app"]);
    expect(calls.some((c) => c.url.endsWith("/auth/v1/user"))).toBe(false);
  });

  test("app-email resolver is skipped without a Supabase session cookie, and a throwing one falls back to the gate", async () => {
    clearGateCache();
    const { f } = fakeFetch((url) => (url.endsWith("/auth/v1/user") ? { email: "gate@example.com" } : { allowed: false, reason: "no_grant", mode: "invite" }));
    let n = 0;
    const g1 = await guardSignalRoom({ cookieHeader: "fgate_at=tok", appEmail: async () => { n++; return "x@y.co"; } }, { cfg: cfg(f), enforce: true });
    expect(n).toBe(0);
    expect([g1.email, g1.identitySource]).toEqual(["gate@example.com", "gate"]);
    const g2 = await guardSignalRoom(
      { cookieHeader: "fgate_at=tok; sb-x-auth-token=s", appEmail: async () => { throw new Error("boom"); } },
      { cfg: cfg(f), enforce: true },
    );
    expect([g2.pass, g2.email, g2.identitySource]).toEqual([false, "gate@example.com", "gate"]);
  });

  test("a guard or probe that throws is treated as a probe error (never a crash)", async () => {
    clearGateCache();
    const boom = (async () => { throw new Error("boom"); }) as never;
    expect((await guardSignalRoom({}, { cfg: gateConfig({}), enforce: false, probe: boom })).pass).toBe(true);
    const closed = await guardSignalRoom({}, { cfg: gateConfig({}), enforce: true, probe: boom });
    expect([closed.pass, closed.view]).toEqual([false, "unavailable"]);
    const okProbe = (async () => ent({ allowed: false, reason: "no_grant", mode: "invite" })) as never;
    expect((await guardSignalRoom({}, { cfg: gateConfig({}), enforce: false, probe: okProbe, guard: boom })).pass).toBe(true);
  });
});

describe("gate copy", () => {
  test("Signal Room gate copy: right key, no price, no counts", () => {
    expect(SIGNALROOM_GATE_COPY.access_key).toBe("signalroom");
    const all = [SIGNALROOM_GATE_COPY.story, ...SIGNALROOM_GATE_COPY.what_you_get].join("\n");
    expect(containsPrice(all)).toBe(false);
    expect(containsCountClaim(all)).toBe(false);
    expect(["draft", "approved"]).toContain(SIGNALROOM_GATE_COPY.status);
  });
});

// ── vendored copy is byte-identical to its manifest (and to the canonical package when present) ─
function listFiles(dir: string, base = dir): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? listFiles(p, base) : [path.relative(base, p).split(path.sep).join("/")];
  });
}
const sha = (p: string) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const manifest = fs.readFileSync(path.join(VENDOR, "MANIFEST.sha256"), "utf8").trim().split("\n").map((l) => {
  const m = l.match(/^([0-9a-f]{64})  (.+)$/);
  if (!m) throw new Error(`bad manifest line: ${l}`);
  return { hash: m[1], file: m[2] };
});

describe("vendored faraday-gate identity", () => {
  test("matches MANIFEST.sha256 exactly (no edits, no extra or missing files)", () => {
    const onDisk = listFiles(VENDOR).filter((f) => f !== "MANIFEST.sha256").sort();
    expect(onDisk).toEqual(manifest.map((m) => m.file).sort());
    for (const m of manifest) expect(sha(path.join(VENDOR, m.file)), `${m.file} drifted`).toBe(m.hash);
    for (const required of ["core.ts", "VERSION", "README.md", "server/check.ts", "server/guard.ts", "server/handlers.ts",
      "server/identity.ts", "server/request.ts", "ui/GatePage.tsx", "ui/gate.html", "gate-copy/signalroom.json"]) {
      expect(manifest.some((m) => m.file === required), `${required} missing`).toBe(true);
    }
    expect(fs.readFileSync(path.join(VENDOR, "VERSION"), "utf8").trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("the masthead GatePage imports is vendored beside it", () => {
    expect(fs.existsSync(path.join(ROOT, "lib", "faraday-masthead", "ui", "Masthead.tsx"))).toBe(true);
  });

  const CANONICAL = process.env.FARADAY_GATE_CANONICAL || path.resolve(ROOT, "../faraday-workbench/packages/faraday-gate");
  test.skipIf(!fs.existsSync(path.join(CANONICAL, "core.ts")))("byte-identical to the canonical package (set FARADAY_GATE_CANONICAL)", () => {
    expect(fs.readFileSync(path.join(VENDOR, "VERSION"), "utf8")).toBe(fs.readFileSync(path.join(CANONICAL, "VERSION"), "utf8"));
    for (const m of manifest) expect(sha(path.join(CANONICAL, m.file)), `${m.file} differs from canonical`).toBe(m.hash);
  });
});
