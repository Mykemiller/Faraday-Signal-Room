// FDY-419 — renders the vendored GatePage under this app's React (18) in every view and greps the
// HTML for a price or "$". Adapted from faraday-workbench/packages/faraday-gate/test/render.test.mjs.
import { expect, test } from "vitest";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import GatePage from "@/lib/faraday-gate/ui/GatePage.tsx";
import { SIGNALROOM_APP, SIGNALROOM_APP_NAME, SIGNALROOM_GATE_COPY, SIGNALROOM_PRIVACY_URL, SIGNALROOM_TERMS_URL } from "@/lib/faradayGate";

const ROOT = path.resolve(__dirname, "..");
const fmVersion = fs.readFileSync(path.join(ROOT, "lib", "faraday-masthead", "VERSION"), "utf8").trim();

test(`GatePage renders under React ${React.version} with no price or $ in any view`, () => {
  for (const view of ["request", "expired", "waitlist", "unavailable"] as const) {
    for (const email of [null, "someone@example.com"]) {
      const html = renderToStaticMarkup(
        <GatePage app={SIGNALROOM_APP} appName={SIGNALROOM_APP_NAME} version="1.2.0" copy={SIGNALROOM_GATE_COPY} view={view} email={email}
          termsUrl={SIGNALROOM_TERMS_URL} privacyUrl={SIGNALROOM_PRIVACY_URL} />,
      );
      const visible = html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<link[^>]*>/g, "");
      expect(visible.includes("$"), `$ in ${view}`).toBe(false);
      expect(/USD|€|£|per month|\/mo\b|tokens?\b/i.test(visible), `price-like text in ${view}`).toBe(false);
      expect(visible).toContain("monthly subscription");
      if (view === "expired") expect(visible).toContain("Ask for more time");
      if (view === "waitlist") expect(visible.includes("Request demo access")).toBe(false);
      if (view !== "unavailable" && view !== "waitlist") expect(visible).toContain("Join the waitlist");
      if (email) expect(visible).toContain(email); else expect(visible).toContain("Sign in");
      expect(visible).toContain(SIGNALROOM_TERMS_URL);
      expect(visible).toContain(SIGNALROOM_PRIVACY_URL);
      expect(html).toContain(`<header class="fm" role="banner" data-fm="${fmVersion}">`);
      expect(html).toContain(`<span class="fm-app">Signal Room</span>`);
    }
  }
  // Copy shows its story only when approved; draft copy renders the neutral line.
  const html = renderToStaticMarkup(<GatePage app={SIGNALROOM_APP} appName={SIGNALROOM_APP_NAME} copy={SIGNALROOM_GATE_COPY} view="request" />);
  if (SIGNALROOM_GATE_COPY.status === "approved") expect(html).toContain(SIGNALROOM_GATE_COPY.story);
  else expect(html).toContain("Signal Room is in a private beta.");
});
