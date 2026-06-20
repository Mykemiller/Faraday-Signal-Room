"use client";

import { useState } from "react";
import { type DraftRule, toApiRule } from "./types";

interface PreviewSignal {
  id: string;
  fired_at: string;
  source: string;
  framing: string;
  byline: string | null;
}

interface DigestPayload {
  signals: PreviewSignal[];
  collapsed: boolean;
  totalMatched: number;
}

/**
 * Test-signal sampler (§9.2): shows what the configuration would have
 * delivered recently. The payload is conviction-free by construction (the
 * subscriber_signals view + serializer); the UI never references conviction.
 */
export function Preview({ rules }: { rules: DraftRule[] }) {
  const [data, setData] = useState<DigestPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/signal-room/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rules: rules.map(toApiRule) }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setError(e.error === "unauthorized" ? "Sign in to preview." : "Preview unavailable.");
        return;
      }
      setData((await res.json()) as DigestPayload);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-cream bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="eyebrow">Preview</p>
        <button
          onClick={run}
          disabled={busy || rules.length === 0}
          className="text-sm text-gold hover:underline disabled:opacity-50"
        >
          {busy ? "Sampling…" : "Test signals"}
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-forest/70">{error}</p>}

      {data && (
        <div className="mt-3 space-y-3">
          {data.signals.length === 0 && (
            <p className="text-sm text-forest/70">No recent signals match yet.</p>
          )}
          {data.signals.map((s) => (
            <div key={s.id} className="border-l-2 border-sage pl-3">
              <p className="text-sm text-forest">{s.framing}</p>
              <p className="mt-1 text-xs text-forest/60">
                {s.source}
                {s.byline ? ` · ${s.byline}` : ""} ·{" "}
                {new Date(s.fired_at).toLocaleDateString()}
              </p>
            </div>
          ))}
          {data.collapsed && (
            <p className="text-xs text-forest/60">
              Showing top {data.signals.length} of {data.totalMatched}. The rest are
              available in-app.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
