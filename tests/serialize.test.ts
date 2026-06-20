import { describe, it, expect } from "vitest";
import {
  toSubscriberSignal,
  toSubscriberSignals,
  assertNoConviction,
} from "@/lib/signal-room/serialize";
import type { Signal } from "@/lib/signal-room/types";

const internalSignal: Signal = {
  id: "s1",
  fired_at: "2026-06-20T00:00:00Z",
  source: "Faraday desk",
  theme_tags: ["T-001"],
  domain_tags: ["D1"],
  subdomain_tags: ["D1.1"],
  company_tags: ["rec_acme"],
  conviction: "High", // INTERNAL — must never leak
  framing: "Something happened.",
  byline: "Gil",
  faradays_take: null,
};

describe("conviction containment (serializer)", () => {
  it("strips conviction from a single signal", () => {
    const out = toSubscriberSignal(internalSignal);
    expect("conviction" in out).toBe(false);
    expect(out.framing).toBe("Something happened.");
  });

  it("strips conviction from an array", () => {
    const out = toSubscriberSignals([internalSignal, internalSignal]);
    out.forEach((s) => expect("conviction" in s).toBe(false));
  });

  it("ignores unexpected extra columns (allow-list serialization)", () => {
    const sneaky = { ...internalSignal, conviction_score: 9, secret: "x" } as unknown as Signal;
    const out = toSubscriberSignal(sneaky) as Record<string, unknown>;
    expect(out.conviction_score).toBeUndefined();
    expect(out.secret).toBeUndefined();
  });

  it("assertNoConviction passes on clean payloads", () => {
    expect(() => assertNoConviction(toSubscriberSignals([internalSignal]))).not.toThrow();
  });

  it("assertNoConviction throws if conviction is nested anywhere", () => {
    expect(() => assertNoConviction({ a: { b: [{ conviction: "High" }] } })).toThrow();
  });
});
