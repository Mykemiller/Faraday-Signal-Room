import { describe, expect, it } from "vitest";
import { projectRef, refFromUrl, roleClaim } from "@/lib/signal-room/diagnostics";

/**
 * Fabricated, unsigned JWTs built purely to exercise the decoder. No real key
 * material appears in this file, and `roleClaim` never returns any part of the
 * token other than the `role` claim itself.
 */
function fakeJwt(payload: Record<string, unknown>): string {
  const enc = (o: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(o))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc(payload)}.not-a-real-signature`;
}

describe("roleClaim", () => {
  it("reads service_role, the key that bypasses RLS", () => {
    expect(roleClaim(fakeJwt({ role: "service_role", iss: "supabase" }))).toBe(
      "service_role",
    );
  });

  it("reads anon, the key denied by signals/faraday_domains RLS", () => {
    expect(roleClaim(fakeJwt({ role: "anon", iss: "supabase" }))).toBe("anon");
  });

  it("flags a publishable key as not a JWT", () => {
    expect(roleClaim("sb_publishable_abcdefghijklmnop")).toBe(
      "NOT_A_JWT (publishable/secret format?)",
    );
  });

  it("flags a secret key as not a JWT", () => {
    expect(roleClaim("sb_secret_abcdefghijklmnop")).toBe(
      "NOT_A_JWT (publishable/secret format?)",
    );
  });

  it("reports MISSING for an unset env var", () => {
    expect(roleClaim(undefined)).toBe("MISSING");
    expect(roleClaim("")).toBe("MISSING");
  });

  it("reports NO_ROLE_CLAIM for a JWT without a role", () => {
    expect(roleClaim(fakeJwt({ iss: "supabase" }))).toBe("NO_ROLE_CLAIM");
  });

  it("reports UNDECODABLE for a malformed JWT-shaped string", () => {
    expect(roleClaim("eyJhbGciOiJIUzI1NiJ9.@@@not-base64@@@.sig")).toBe(
      "UNDECODABLE",
    );
    expect(roleClaim("eyJvbmx5LXNlZ21lbnQ")).toBe("UNDECODABLE");
  });

  it("returns only the role, never other payload fields", () => {
    const token = fakeJwt({ role: "service_role", secretish: "SHOULD-NOT-LEAK" });
    expect(roleClaim(token)).toBe("service_role");
    expect(roleClaim(token)).not.toContain("SHOULD-NOT-LEAK");
  });
});

describe("projectRef / refFromUrl", () => {
  it("reads the ref claim, which names the key's project", () => {
    expect(
      projectRef(fakeJwt({ role: "service_role", ref: "ycadmmngkdhvpcsrcuaq" })),
    ).toBe("ycadmmngkdhvpcsrcuaq");
  });

  it("returns null for a non-JWT or a JWT without a ref", () => {
    expect(projectRef("sb_publishable_abc")).toBeNull();
    expect(projectRef(undefined)).toBeNull();
    expect(projectRef(fakeJwt({ role: "anon" }))).toBeNull();
  });

  it("extracts the ref from a project URL", () => {
    expect(refFromUrl("https://ycadmmngkdhvpcsrcuaq.supabase.co")).toBe(
      "ycadmmngkdhvpcsrcuaq",
    );
    expect(refFromUrl("https://ycadmmngkdhvpcsrcuaq.supabase.co/")).toBe(
      "ycadmmngkdhvpcsrcuaq",
    );
    expect(refFromUrl("  https://abc123.supabase.co  ")).toBe("abc123");
    expect(refFromUrl("not-a-url")).toBeNull();
    expect(refFromUrl(undefined)).toBeNull();
  });

  it("detects a key whose project differs from the URL's", () => {
    const key = fakeJwt({ role: "service_role", ref: "someotherproject" });
    expect(projectRef(key)).not.toBe(
      refFromUrl("https://ycadmmngkdhvpcsrcuaq.supabase.co"),
    );
  });
});
