import { describe, it, expect } from "vitest";
import { toApiRule, type DraftRule } from "@/components/signal-room/types";

describe("DraftRule -> API rule mapping (single-FK invariant, review item 1)", () => {
  const base = { key: "k", label: "x", frequency: "daily", delivery_rail: "in_app" } as const;

  it("sets exactly the theme_code column for a theme rule", () => {
    const out = toApiRule({ ...base, dimension: "theme", refId: "T-001" } as DraftRule);
    expect(out.theme_code).toBe("T-001");
    expect([out.domain_code, out.subdomain_code, out.company_id]).toEqual([null, null, null]);
  });

  it("sets exactly the company_id column for a company rule", () => {
    const out = toApiRule({ ...base, dimension: "company", refId: "rec_acme" } as DraftRule);
    expect(out.company_id).toBe("rec_acme");
    expect([out.theme_code, out.domain_code, out.subdomain_code]).toEqual([null, null, null]);
  });

  it("always populates exactly one FK column", () => {
    (["theme", "domain", "subdomain", "company"] as const).forEach((dimension) => {
      const out = toApiRule({ ...base, dimension, refId: "id" } as DraftRule);
      const nonNull = [out.theme_code, out.domain_code, out.subdomain_code, out.company_id].filter(
        (v) => v !== null,
      );
      expect(nonNull).toHaveLength(1);
    });
  });
});
