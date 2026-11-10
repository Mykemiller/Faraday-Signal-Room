import { describe, it, expect } from "vitest";
import { buildHealth, type HealthInput } from "@/lib/signal-room/health";

const NOW = Date.parse("2026-11-10T22:00:00Z");
const opts = { nowMs: NOW, live: true, window: 200 };

const tax = { themes: [{}], domains: [{}], subdomains: [{}] };
const feed = (over: Partial<HealthInput> = {}): HealthInput => ({
  error: null,
  signals: [
    { fired_at: "2026-11-10T07:30:00Z" }, // 14.5h ago — inside the window
    { fired_at: "2026-11-09T07:30:00Z" }, // 38.5h ago — outside
    { fired_at: "2026-11-09T22:00:00Z" }, // exactly 24h — inside (>= cutoff)
  ],
  ...tax,
  ...over,
});

describe("buildHealth", () => {
  it("reports ok with counts and the newest fired_at", () => {
    const h = buildHealth(feed(), opts);
    expect(h).toMatchObject({
      ok: true,
      status: "ok",
      live: true,
      signals: 3,
      last24h: 2,
      newestFiredAt: "2026-11-10T07:30:00.000Z",
      window: 200,
      checkedAt: "2026-11-10T22:00:00.000Z",
    });
  });

  it("maps the page's two error codes to distinct statuses", () => {
    expect(buildHealth(feed({ error: "not_configured", signals: [] }), opts).status).toBe("not_configured");
    expect(buildHealth(feed({ error: "query_failed", signals: [] }), opts).status).toBe("query_failed");
  });

  it("treats a successful but empty read as NOT ok (the RLS-denial shape)", () => {
    expect(buildHealth(feed({ signals: [] }), opts)).toMatchObject({ ok: false, status: "empty" });
    expect(buildHealth(feed({ domains: [] }), opts)).toMatchObject({ ok: false, status: "empty" });
  });

  it("never reports counts or a timestamp when unhealthy", () => {
    const h = buildHealth(feed({ error: "query_failed" }), opts);
    expect(h).toMatchObject({ ok: false, signals: 0, last24h: 0, newestFiredAt: null });
  });

  it("carries the live flag through independently of feed health", () => {
    expect(buildHealth(feed(), { ...opts, live: false })).toMatchObject({ ok: true, live: false });
  });

  it("ignores unparseable fired_at values instead of producing NaN", () => {
    const h = buildHealth(feed({ signals: [{ fired_at: "not a date" }, { fired_at: "2026-11-10T07:30:00Z" }] }), opts);
    expect(h.newestFiredAt).toBe("2026-11-10T07:30:00.000Z");
    expect(h.last24h).toBe(1);
  });

  it("exposes only counts, flags and timestamps", () => {
    expect(Object.keys(buildHealth(feed(), opts)).sort()).toEqual(
      ["checkedAt", "last24h", "live", "newestFiredAt", "ok", "signals", "status", "window"],
    );
  });
});
