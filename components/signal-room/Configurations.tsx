"use client";

import { useEffect, useState } from "react";

interface RuleRow {
  id: string;
  dimension: string;
  theme_code: string | null;
  domain_code: string | null;
  subdomain_code: string | null;
  company_id: string | null;
}
interface ConfigRow {
  id: string;
  status: "inactive" | "active" | "paused" | "cancelled";
  activated_until: string | null;
  created_at: string;
  signal_configuration_rules: RuleRow[];
}

/** Manage view (§9.2): list / pause / resume / cancel; active-until + renewal. */
export function Configurations() {
  const [configs, setConfigs] = useState<ConfigRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/signal-room/configurations");
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      setError(e.error === "unauthorized" ? "Sign in to see your configurations." : "Could not load.");
      setConfigs([]);
      return;
    }
    const body = await res.json();
    setConfigs(body.configurations ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function act(id: string, action: "pause" | "resume" | "cancel") {
    await fetch("/api/signal-room/configurations", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    load();
  }

  if (error) return <p className="text-forest/70">{error}</p>;
  if (configs === null) return <p className="text-forest/70">Loading…</p>;
  if (configs.length === 0)
    return <p className="text-forest/70">No configurations yet. Compose one to get started.</p>;

  return (
    <ul className="space-y-3">
      {configs.map((c) => {
        const expired = c.activated_until && new Date(c.activated_until) < new Date();
        return (
          <li key={c.id} className="rounded-lg border border-cream bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-forest">
                  {c.signal_configuration_rules.length} selection
                  {c.signal_configuration_rules.length === 1 ? "" : "s"}
                </p>
                <p className="text-sm text-forest/60">
                  {c.status === "active" && c.activated_until && !expired
                    ? `Active through ${new Date(c.activated_until).toLocaleDateString()}`
                    : c.status === "active" && expired
                      ? "Window expired — renew to reactivate"
                      : `Status: ${c.status}`}
                </p>
              </div>
              <div className="flex gap-2 text-sm">
                {c.status === "active" && (
                  <button className="text-gold hover:underline" onClick={() => act(c.id, "pause")}>
                    Pause
                  </button>
                )}
                {c.status === "paused" && (
                  <button className="text-gold hover:underline" onClick={() => act(c.id, "resume")}>
                    Resume
                  </button>
                )}
                {c.status !== "cancelled" && (
                  <button className="text-forest/50 hover:underline" onClick={() => act(c.id, "cancel")}>
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
