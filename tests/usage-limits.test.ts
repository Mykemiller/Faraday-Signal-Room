import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * FDY-394 · UL-4 — daily signal settings limit.
 * The usage_consume RPC is mocked with a small in-memory model of the shared
 * contract (FDY-353 prompt §3): limit 5, distinct items, dry run, weight.
 */

// ---- in-memory usage_consume model -----------------------------------------
type Args = {
  p_app: string;
  p_metric: string;
  p_subject: string;
  p_item: string | null;
  p_weight: number;
  p_ip_subject: string | null;
  p_dry_run: boolean;
};
const RESET_AT = "2026-11-25T00:00:00+00:00";
const ledger = {
  limit: 5,
  used: new Map<string, number>(),
  items: new Set<string>(),
  calls: [] as Args[],
  mode: "ok" as "ok" | "error" | "throw" | "hang",
};
function modelConsume(a: Args) {
  ledger.calls.push(a);
  const key = `${a.p_app}|${a.p_metric}|${a.p_subject}`;
  const used = ledger.used.get(key) ?? 0;
  const base = { mode: "enforce", limit: ledger.limit, reset_at: RESET_AT, bypass: false };
  if (a.p_item && ledger.items.has(`${key}|${a.p_item}`)) {
    return { ...base, allowed: true, reason: "already_counted", used, remaining: ledger.limit - used };
  }
  if (used + a.p_weight > ledger.limit) {
    return { ...base, allowed: false, reason: "limit", used, remaining: ledger.limit - used };
  }
  if (!a.p_dry_run) {
    ledger.used.set(key, used + a.p_weight);
    if (a.p_item) ledger.items.add(`${key}|${a.p_item}`);
  }
  return { ...base, allowed: true, reason: "ok", used: used + a.p_weight, remaining: 0 };
}

// ---- fake Supabase clients -------------------------------------------------
const writes: { table: string; op: string; payload: unknown }[] = [];
let signedIn: Record<string, unknown> | null = { id: "auth-user-1", email: "a@b.c", email_confirmed_at: null };
let personRow: { id: string } | null = null;

function writeBuilder(table: string, op: string, payload: unknown) {
  writes.push({ table, op, payload });
  const result =
    table === "signal_configurations" && op === "insert"
      ? { data: { id: "cfg-1" }, error: null }
      : { data: null, error: null };
  const b: any = {
    select: () => b,
    single: () => Promise.resolve(result),
    eq: () => Promise.resolve(result),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej),
  };
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: signedIn } }) },
    from: (table: string) => ({
      insert: (p: unknown) => writeBuilder(table, "insert", p),
      update: (p: unknown) => writeBuilder(table, "update", p),
      delete: () => writeBuilder(table, "delete", null),
    }),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: (name: string, args: Args) => ({
      abortSignal: (_s: AbortSignal) => {
        expect(name).toBe("usage_consume");
        if (ledger.mode === "error") {
          ledger.calls.push(args);
          return Promise.resolve({ data: null, error: { message: "boom" } });
        }
        if (ledger.mode === "throw") return Promise.reject(new Error("network"));
        if (ledger.mode === "hang") return new Promise(() => {});
        return Promise.resolve({ data: modelConsume(args), error: null });
      },
    }),
    from: (table: string) => {
      const q: any = {
        select: () => q,
        eq: () => q,
        not: () => q,
        limit: () => q,
        maybeSingle: async () =>
          table === "estate_people" ? { data: personRow, error: null } : { data: null, error: null },
      };
      return q;
    },
  }),
}));

import { NextRequest } from "next/server";
import { POST, PATCH } from "@/app/api/signal-room/configurations/route";
import {
  consume,
  consumeRuleWrites,
  ipSubjectFor,
  usageIdentity,
  resolvePersonId,
  VISITOR_COOKIE,
  type UsageRpc,
} from "@/lib/usage/limits";
import { usageNoticeText } from "@/lib/usage/notice";

const PERSON = "11111111-2222-4333-8444-555555555555";
const rule = (code: string) => ({ dimension: "theme", theme_code: code, frequency: "daily" });

function post(rules: unknown[], cookie?: string) {
  return new NextRequest("https://sr.test/api/signal-room/configurations", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.7, 10.0.0.1",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ rules }),
  });
}
function patch(action: string) {
  return new NextRequest("https://sr.test/api/signal-room/configurations", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "cfg-1", action }),
  });
}
const ruleInserts = () =>
  writes.filter((w) => w.table === "signal_configuration_rules" && w.op === "insert");
const configInserts = () =>
  writes.filter((w) => w.table === "signal_configurations" && w.op === "insert");

beforeEach(() => {
  ledger.used.clear();
  ledger.items.clear();
  ledger.calls.length = 0;
  ledger.mode = "ok";
  ledger.limit = 5;
  writes.length = 0;
  signedIn = { id: "auth-user-1", email: "a@b.c", email_confirmed_at: null };
  personRow = { id: PERSON };
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("POST /configurations — daily signal settings limit", () => {
  it("allows 5 distinct rules, then refuses the 6th with 429 and writes nothing", async () => {
    for (let i = 1; i <= 5; i++) {
      const res = await POST(post([rule(`T-00${i}`)]));
      expect(res.status).toBe(201);
    }
    expect(ruleInserts()).toHaveLength(5);
    const before = writes.length;

    const res = await POST(post([rule("T-006")]));
    expect(res.status).toBe(429);
    const body = await res.json();
    // exact body: no used / limit / remaining numbers reach the browser
    expect(body).toEqual({ error: "daily_limit", reset_at: "2026-11-25T00:00:00.000Z" });
    expect(writes.length).toBe(before); // nothing written: no config, no rules
  });

  it("consumes metric signal_settings with item = the inserted rule's own id", async () => {
    await POST(post([rule("T-001"), rule("T-002")]));
    const consumed = ledger.calls.filter((c) => !c.p_dry_run);
    expect(consumed.every((c) => c.p_app === "SR" && c.p_metric === "signal_settings")).toBe(true);
    const insertedIds = (ruleInserts()[0].payload as { id: string }[]).map((r) => r.id);
    expect(consumed.map((c) => c.p_item)).toEqual(insertedIds);
    expect(insertedIds.every((id) => /^[0-9a-f-]{36}$/.test(id))).toBe(true);
  });

  it("refuses a batch that does not fit before spending anything", async () => {
    await POST(post([rule("T-001"), rule("T-002"), rule("T-003")]));
    const res = await POST(post([rule("T-004"), rule("T-005"), rule("T-006")]));
    expect(res.status).toBe(429);
    expect([...ledger.used.values()][0]).toBe(3); // dry run refused, nothing burnt
    expect(configInserts()).toHaveLength(1);
  });

  it("fails closed on an RPC error: 429, nothing written", async () => {
    ledger.mode = "error";
    const res = await POST(post([rule("T-001")]));
    expect(res.status).toBe(429);
    expect(writes).toHaveLength(0);
  });

  it("fails closed when the RPC throws: 429, nothing written", async () => {
    ledger.mode = "throw";
    const res = await POST(post([rule("T-001")]));
    expect(res.status).toBe(429);
    expect(writes).toHaveLength(0);
  });

  it("does not charge a save with no rules", async () => {
    const res = await POST(post([]));
    expect(res.status).toBe(201);
    expect(ledger.calls).toHaveLength(0);
  });

  it("counts a signed-in person as p:<person id> with no IP subject", async () => {
    await POST(post([rule("T-001")]));
    expect(ledger.calls[0].p_subject).toBe(`p:${PERSON}`);
    expect(ledger.calls[0].p_ip_subject).toBeNull();
  });

  it("without a person, mints an httpOnly sr_vid cookie and counts by it", async () => {
    personRow = null;
    const res = await POST(post([rule("T-001")]));
    const set = res.headers.get("set-cookie") ?? "";
    expect(set).toMatch(new RegExp(`^${VISITOR_COOKIE}=[A-Za-z0-9_-]{22};`));
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/Secure/i);
    expect(set).toMatch(/SameSite=lax/i);
    const vid = set.split(";")[0].split("=")[1];
    expect(ledger.calls[0].p_subject).toBe(`v:${vid}`);

    // the same visitor next time reuses the cookie and gets no new one
    const again = await POST(post([rule("T-002")], `${VISITOR_COOKIE}=${vid}`));
    expect(again.headers.get("set-cookie")).toBeNull();
    expect(ledger.calls.at(-1)!.p_subject).toBe(`v:${vid}`);
  });
});

describe("pause / resume / cancel are free", () => {
  it("never calls usage_consume, even at the limit", async () => {
    ledger.limit = 0;
    for (const action of ["pause", "resume", "cancel"]) {
      const res = await PATCH(patch(action));
      expect(res.status).toBe(200);
    }
    expect(ledger.calls).toHaveLength(0);
    expect(writes.filter((w) => w.op === "update")).toHaveLength(3);
  });
});

describe("consume helpers", () => {
  const visitor = { subject: "v:abcdefghijklmnopqrstuv", ipSubject: null, newVisitorId: null };
  const rpc: UsageRpc = async (args) => ({ data: modelConsume(args), error: null });

  it("re-saving a rule already counted today is free, even at the limit", async () => {
    const ids = ["r1", "r2", "r3", "r4", "r5"];
    expect((await consumeRuleWrites(ids, visitor, { rpc })).allowed).toBe(true);
    // an edit of r3 (allNew=false: some ids may already be counted)
    const reedit = await consumeRuleWrites(["r3"], visitor, { rpc }, { allNew: false });
    expect(reedit).toMatchObject({ allowed: true, reason: "already_counted" });
    expect((await consumeRuleWrites(["r6"], visitor, { rpc }, { allNew: false })).allowed).toBe(false);
  });

  it("fails closed on timeout", async () => {
    const hang: UsageRpc = () => new Promise(() => {});
    const t0 = Date.now();
    const r = await consume({ metric: "signal_settings", item: "x" }, visitor, { rpc: hang, timeoutMs: 30 });
    expect(r).toMatchObject({ allowed: false, reason: "error" });
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it("fails closed on a malformed answer", async () => {
    const bad: UsageRpc = async () => ({ data: { allowed: "yes" }, error: null });
    expect((await consume({ metric: "signal_settings" }, visitor, { rpc: bad })).allowed).toBe(false);
  });

  it("refuses the wrong Supabase project", async () => {
    const prev = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://xgbpmlkanxewtfizloay.supabase.co";
    try {
      const r = await consume({ metric: "signal_settings" }, visitor);
      expect(r).toMatchObject({ allowed: false, reason: "error" });
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = prev;
    }
  });

  it("IP subject is an HMAC (D5), skipped without a salt", () => {
    const s = ipSubjectFor("203.0.113.7", "salt");
    expect(s).toMatch(/^ip:[0-9a-f]{32}$/);
    expect(s).not.toContain("203");
    expect(ipSubjectFor("203.0.113.7", undefined)).toBeNull();
    const h = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
    const anon = usageIdentity({ personId: null, visitorCookie: undefined, headers: h, salt: "salt" });
    expect(anon.ipSubject).toBe(s);
    const known = usageIdentity({ personId: PERSON, visitorCookie: undefined, headers: h, salt: "salt" });
    expect(known).toEqual({ subject: `p:${PERSON}`, ipSubject: null, newVisitorId: null });
  });

  it("maps an email to a person only when the email is confirmed", async () => {
    const calls: string[] = [];
    const client = {
      from: (table: string) => {
        const q: any = {
          select: () => q,
          eq: () => q,
          not: () => q,
          limit: () => q,
          maybeSingle: async () => {
            calls.push(table);
            return table === "subscribers" ? { data: { person_id: PERSON }, error: null } : { data: null, error: null };
          },
        };
        return q;
      },
    };
    expect(await resolvePersonId(client, { id: "u", email: "A@B.c", email_confirmed_at: null })).toBeNull();
    expect(calls).toEqual(["estate_people"]);
    expect(
      await resolvePersonId(client, { id: "u", email: "A@B.c", email_confirmed_at: "2026-11-01T00:00:00Z" }),
    ).toBe(PERSON);
  });
});

describe("notice copy (D12)", () => {
  it("matches the agreed line, with no numbers but the local time", () => {
    const text = usageNoticeText("2026-11-25T00:00:00Z", "en-US", "America/Chicago");
    expect(text).toBe("You've changed today's set of signal settings. More open up at 6:00 PM.");
    expect(text.replace("6:00", "")).not.toMatch(/\d/);
    expect(text).not.toMatch(/limit|quota|upgrade|plan|API/i);
  });
  it("falls back gracefully without a reset time", () => {
    expect(usageNoticeText(null)).toBe("You've changed today's set of signal settings. More open up tomorrow.");
  });
});
