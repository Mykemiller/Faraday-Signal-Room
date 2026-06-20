import { describe, it, expect } from "vitest";
import {
  ruleMatchesSignal,
  signalMatchesConfiguration,
  filterMatchingSignals,
  collapseDigest,
} from "@/lib/signal-room/matching";
import type { ConfigurationRule, SubscriberSignal } from "@/lib/signal-room/types";

function rule(partial: Partial<ConfigurationRule>): ConfigurationRule {
  return {
    id: "r",
    configuration_id: "c",
    dimension: "theme",
    theme_code: null,
    domain_code: null,
    subdomain_code: null,
    company_id: null,
    threshold_spec: null,
    frequency: "daily",
    delivery_rail: "in_app",
    paused: false,
    selection_order: 0,
    added_at: "",
    ...partial,
  };
}

const signal: Pick<
  SubscriberSignal,
  "theme_tags" | "domain_tags" | "subdomain_tags" | "company_tags"
> = {
  theme_tags: ["T-001"],
  domain_tags: ["D1"],
  subdomain_tags: ["D1.1"],
  company_tags: ["rec_acme"],
};

describe("OR-union matching (review item 4)", () => {
  it("matches a theme rule when the tag is present", () => {
    expect(ruleMatchesSignal(rule({ dimension: "theme", theme_code: "T-001" }), signal)).toBe(true);
  });

  it("does not match a theme rule for an absent tag", () => {
    expect(ruleMatchesSignal(rule({ dimension: "theme", theme_code: "T-999" }), signal)).toBe(false);
  });

  it("paused rules never match", () => {
    expect(
      ruleMatchesSignal(rule({ dimension: "domain", domain_code: "D1", paused: true }), signal),
    ).toBe(false);
  });

  it("threshold rules are out of tag-matching scope", () => {
    expect(ruleMatchesSignal(rule({ dimension: "threshold", threshold_spec: {} }), signal)).toBe(false);
  });

  it("a signal matches if ANY active rule matches (OR union)", () => {
    const rules = [
      rule({ dimension: "theme", theme_code: "T-999" }), // miss
      rule({ dimension: "company", company_id: "rec_acme" }), // hit
    ];
    expect(signalMatchesConfiguration(rules, signal)).toBe(true);
  });

  it("no active rules => no matches", () => {
    expect(filterMatchingSignals([], [signal as SubscriberSignal])).toHaveLength(0);
  });
});

describe("digest collapse (review item 6)", () => {
  const mk = (i: number): SubscriberSignal => ({
    id: `s${i}`,
    fired_at: "2026-06-20T00:00:00Z",
    source: "x",
    theme_tags: [],
    domain_tags: [],
    subdomain_tags: [],
    company_tags: [],
    framing: "f",
    byline: null,
    faradays_take: null,
  });

  it("does not collapse at or below the threshold", () => {
    const d = collapseDigest(Array.from({ length: 20 }, (_, i) => mk(i)));
    expect(d.collapsed).toBe(false);
    expect(d.signals).toHaveLength(20);
  });

  it("collapses to top 5 above the threshold", () => {
    const d = collapseDigest(Array.from({ length: 21 }, (_, i) => mk(i)));
    expect(d.collapsed).toBe(true);
    expect(d.signals).toHaveLength(5);
    expect(d.totalMatched).toBe(21);
  });
});
