import { describe, it, expect } from "vitest";
import {
  ALL,
  buildTaxonomyIndex,
  convictionTier,
  domainsForTheme,
  enrichSignal,
  enrichSignals,
  filterSignals,
  reconcileFilters,
  threadsFor,
  within24h,
  type DomainRow,
  type RawSignal,
  type SubdomainRow,
  type ThemeRow,
} from "@/lib/signal-room/live-feed";

// ── Fixtures modelled on the live taxonomy shape ─────────────────────────────
const themes: ThemeRow[] = [
  { theme_code: "T-001", name: "The Power Reckoning", tagline: null },
  { theme_code: "T-002", name: "The Thermal Reckoning", tagline: null },
  { theme_code: "T-005", name: "The Inference Economy", tagline: null },
];

const domains: DomainRow[] = [
  { domain_code: "D1", domain_num: 1, domain_name: "Chips & Density", emoji: "💻" },
  { domain_code: "D7", domain_num: 7, domain_name: "Cooling", emoji: "🧊" },
  { domain_code: "D10", domain_num: 10, domain_name: "Construction", emoji: null },
];

const subdomains: SubdomainRow[] = [
  { subdomain_code: "D1.1", domain_code: "D1", display_name: "GPU Architecture", theme_tags: ["T-002", "T-005"] },
  { subdomain_code: "D1.4", domain_code: "D1", display_name: "Memory (HBM)", theme_tags: ["T-005"] },
  { subdomain_code: "D7.1", domain_code: "D7", display_name: "Liquid Cooling", theme_tags: ["T-002"] },
  { subdomain_code: "D10.1", domain_code: "D10", display_name: "Long-Lead Equipment", theme_tags: ["T-001"] },
];

const index = buildTaxonomyIndex(themes, domains, subdomains);

function raw(partial: Partial<RawSignal>): RawSignal {
  return {
    id: "s",
    fired_at: "2026-07-24T07:30:00Z",
    source: "pipeline",
    theme_tags: [],
    domain_tags: [],
    subdomain_tags: [],
    company_tags: [],
    conviction: "Medium",
    framing: "framing",
    byline: "Gil",
    faradays_take: "take",
    ...partial,
  };
}

describe("buildTaxonomyIndex", () => {
  it("derives each domain's theme set from its sub-domains", () => {
    expect(new Set(index.domainThemeCodes.D1)).toEqual(new Set(["T-002", "T-005"]));
    expect(index.domainThemeCodes.D7).toEqual(["T-002"]);
    expect(index.domainThemeCodes.D10).toEqual(["T-001"]);
  });
});

describe("enrichSignal", () => {
  it("derives Theaters from a signal's sub-domains when theme_tags are empty", () => {
    const s = enrichSignal(raw({ domain_tags: ["D1"], subdomain_tags: ["D1.4"] }), index);
    expect(s.themeCodes).toEqual(["T-005"]); // from D1.4
    expect(s.domainCodes).toEqual(["D1"]);
    expect(s.subdomainCodes).toEqual(["D1.4"]);
  });

  it("adds parent domains from sub-domains and de-dupes", () => {
    const s = enrichSignal(raw({ domain_tags: ["D1"], subdomain_tags: ["D1.1", "D7.1"] }), index);
    expect(new Set(s.domainCodes)).toEqual(new Set(["D1", "D7"]));
    expect(new Set(s.themeCodes)).toEqual(new Set(["T-002", "T-005"]));
  });

  it("honors explicit theme_tags on the rare signal that carries them", () => {
    const s = enrichSignal(raw({ theme_tags: ["T-001"], domain_tags: ["D1"] }), index);
    expect(s.themeCodes).toEqual(["T-001"]);
  });

  it("tolerates null jsonb arrays without throwing", () => {
    const s = enrichSignal(
      raw({ theme_tags: null, domain_tags: null, subdomain_tags: null }),
      index,
    );
    expect(s.themeCodes).toEqual([]);
    expect(s.domainCodes).toEqual([]);
    expect(s.subdomainCodes).toEqual([]);
  });

  it("ignores unknown sub-domain codes (no crash, no derived theme)", () => {
    const s = enrichSignal(raw({ subdomain_tags: ["D99.9"] }), index);
    expect(s.themeCodes).toEqual([]);
    expect(s.domainCodes).toEqual([]);
  });
});

describe("cascading option lists", () => {
  it("domainsForTheme narrows to domains that host the theme", () => {
    expect(domainsForTheme(index, "T-005").map((d) => d.domain_code)).toEqual(["D1"]);
    expect(domainsForTheme(index, "T-002").map((d) => d.domain_code)).toEqual(["D1", "D7"]);
    expect(domainsForTheme(index, ALL).length).toBe(3);
  });

  it("threadsFor composes Theater and Sector narrowing", () => {
    expect(threadsFor(index, ALL, "D1").map((s) => s.subdomain_code)).toEqual(["D1.1", "D1.4"]);
    expect(threadsFor(index, "T-005", ALL).map((s) => s.subdomain_code)).toEqual(["D1.1", "D1.4"]);
    expect(threadsFor(index, "T-002", "D1").map((s) => s.subdomain_code)).toEqual(["D1.1"]);
    expect(threadsFor(index, ALL, ALL).length).toBe(4);
  });
});

describe("filterSignals", () => {
  const feed = enrichSignals(
    [
      raw({ id: "a", domain_tags: ["D1"], subdomain_tags: ["D1.4"] }), // T-005
      raw({ id: "b", domain_tags: ["D7"], subdomain_tags: ["D7.1"] }), // T-002
      raw({ id: "c", domain_tags: ["D10"], subdomain_tags: ["D10.1"] }), // T-001
    ],
    index,
  );

  it("returns everything when all filters are ALL", () => {
    expect(filterSignals(feed, { theme: ALL, sector: ALL, thread: ALL })).toHaveLength(3);
  });

  it("filters by Theater (derived)", () => {
    const r = filterSignals(feed, { theme: "T-002", sector: ALL, thread: ALL });
    expect(r.map((s) => s.id)).toEqual(["b"]);
  });

  it("filters by Sector and Thread independently", () => {
    expect(filterSignals(feed, { theme: ALL, sector: "D1", thread: ALL }).map((s) => s.id)).toEqual(["a"]);
    expect(filterSignals(feed, { theme: ALL, sector: ALL, thread: "D10.1" }).map((s) => s.id)).toEqual(["c"]);
  });
});

describe("reconcileFilters", () => {
  it("clears a Sector that is invalid under the new Theater", () => {
    const out = reconcileFilters(index, { theme: "T-005", sector: "D7", thread: ALL });
    expect(out.sector).toBe(ALL); // D7 has no T-005 sub-domain
  });

  it("clears a Thread when its Sector no longer applies", () => {
    const out = reconcileFilters(index, { theme: "T-002", sector: "D1", thread: "D7.1" });
    expect(out.thread).toBe(ALL); // D7.1 is not under D1
  });

  it("keeps valid selections intact", () => {
    const out = reconcileFilters(index, { theme: "T-002", sector: "D1", thread: "D1.1" });
    expect(out).toEqual({ theme: "T-002", sector: "D1", thread: "D1.1" });
  });
});

describe("within24h", () => {
  const now = Date.parse("2026-07-24T12:00:00Z");
  it("keeps rolling-24h signals and drops older ones", () => {
    const feed = enrichSignals(
      [
        raw({ id: "fresh", fired_at: "2026-07-24T07:30:00Z" }),
        raw({ id: "stale", fired_at: "2026-07-22T07:30:00Z" }),
      ],
      index,
    );
    expect(within24h(feed, now).map((s) => s.id)).toEqual(["fresh"]);
  });
});

describe("convictionTier", () => {
  it("maps the live distinct values case-insensitively", () => {
    expect(convictionTier("High")).toBe("high");
    expect(convictionTier("medium")).toBe("medium");
    expect(convictionTier("LOW")).toBe("low");
  });
  it("returns null for unknown/absent conviction (never fabricated)", () => {
    expect(convictionTier(null)).toBeNull();
    expect(convictionTier("")).toBeNull();
    expect(convictionTier("bogus")).toBeNull();
  });
});
