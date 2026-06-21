"use client";

import { useMemo, useState } from "react";
import {
  type Taxonomy,
  type DraftRule,
  type Frequency,
  type DeliveryRail,
  toApiRule,
} from "./types";
import { PresetGallery } from "./PresetGallery";
import { Preview } from "./Preview";

const MAX_RULES = 30; // mirrors the DB cap (review item 6, §10)

let uid = 0;
const nextKey = () => `r${++uid}`;

export function Composer({
  taxonomy,
  onActivated,
}: {
  taxonomy: Taxonomy;
  onActivated: () => void;
}) {
  const [rules, setRules] = useState<DraftRule[]>([]);
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [rail, setRail] = useState<DeliveryRail>("email_digest");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function addRule(
    dimension: DraftRule["dimension"],
    refId: string,
    label: string,
  ) {
    if (rules.length >= MAX_RULES) {
      setMessage(`You can add up to ${MAX_RULES} selections per configuration.`);
      return;
    }
    if (rules.some((r) => r.dimension === dimension && r.refId === refId)) return;
    setRules((prev) => [
      ...prev,
      { key: nextKey(), dimension, refId, label, frequency, delivery_rail: rail },
    ]);
  }

  function removeRule(key: string) {
    setRules((prev) => prev.filter((r) => r.key !== key));
  }

  const summary = useMemo(() => buildSummary(rules, frequency, rail), [rules, frequency, rail]);

  async function saveAndActivate() {
    setBusy(true);
    setMessage(null);
    try {
      const createRes = await fetch("/api/signal-room/configurations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rules: rules.map(toApiRule) }),
      });
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        setMessage(err.error === "unauthorized" ? "Please sign in to activate." : `Could not save configuration (${err.error ?? createRes.status}).`);
        return;
      }
      const { id } = await createRes.json();

      const actRes = await fetch("/api/signal-room/activate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ configuration_id: id }),
      });
      const actBody = await actRes.json().catch(() => ({}));

      if (actRes.status === 402) {
        setMessage("You don't have enough tokens to activate. Add tokens to continue.");
        return;
      }
      if (!actRes.ok) {
        setMessage(`Activation failed (${actBody.error ?? actRes.status}).`);
        return;
      }
      setMessage(
        `Activated. Active through ${new Date(actBody.activated_until).toLocaleDateString()}.`,
      );
      onActivated();
    } finally {
      setBusy(false);
    }
  }

  function applyPreset(presetRules: DraftRule[]) {
    setRules(presetRules.map((r) => ({ ...r, key: nextKey() })));
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div>
        <PresetGallery taxonomy={taxonomy} onApply={applyPreset} />

        <section className="mt-8">
          <h2 className="font-serif text-xl">Theaters</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {taxonomy.themes.map((t) => (
              <Chip
                key={t.theme_code}
                title={t.tagline ?? undefined}
                onClick={() => addRule("theme", t.theme_code, t.name)}
              >
                {t.name}
              </Chip>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="font-serif text-xl">Sectors</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {taxonomy.domains.map((d) => (
              <Chip
                key={d.domain_code}
                onClick={() => addRule("domain", d.domain_code, d.domain_name)}
              >
                {d.emoji ? `${d.emoji} ` : ""}
                {d.domain_name}
              </Chip>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="font-serif text-xl">Threads</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {taxonomy.subdomains.map((s) => (
              <Chip
                key={s.subdomain_code}
                onClick={() => addRule("subdomain", s.subdomain_code, s.display_name)}
              >
                {s.display_name}
              </Chip>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="font-serif text-xl">Companies</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {taxonomy.companies.map((c) => (
              <Chip
                key={c.company_id}
                onClick={() => addRule("company", c.company_id, c.name)}
              >
                {c.name}
              </Chip>
            ))}
          </div>
        </section>

        <section className="mt-6 flex flex-wrap items-center gap-4">
          <label className="text-sm">
            Cadence{" "}
            <select
              className="ml-1 rounded border border-cream bg-white px-2 py-1"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as Frequency)}
            >
              <option value="realtime">Real-time</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <label className="text-sm">
            Delivery{" "}
            <select
              className="ml-1 rounded border border-cream bg-white px-2 py-1"
              value={rail}
              onChange={(e) => setRail(e.target.value as DeliveryRail)}
            >
              <option value="email_digest">Email digest</option>
              <option value="in_app">In-app</option>
            </select>
          </label>
        </section>
      </div>

      {/* Summary band + actions (§9.2 voice) */}
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-lg border border-cream bg-white p-4">
          <p className="eyebrow">Your configuration</p>
          <p className="mt-2 text-forest">{summary}</p>

          {rules.length > 0 && (
            <ul className="mt-4 space-y-1 text-sm">
              {rules.map((r) => (
                <li key={r.key} className="flex items-center justify-between">
                  <span className="text-forest/80">{r.label}</span>
                  <button
                    className="text-xs text-gold hover:underline"
                    onClick={() => removeRule(r.key)}
                  >
                    remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            disabled={busy || rules.length === 0}
            onClick={saveAndActivate}
            className="mt-4 w-full rounded bg-forest px-4 py-2 text-warm-white disabled:opacity-50"
          >
            {busy ? "Activating…" : "Activate"}
          </button>

          {message && <p className="mt-3 text-sm text-forest/80">{message}</p>}
        </div>

        <div className="mt-4">
          <Preview rules={rules} />
        </div>
      </aside>
    </div>
  );
}

function Chip({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="rounded-full border border-sage/50 bg-cream px-3 py-1 text-sm text-forest hover:border-gold"
    >
      {children}
    </button>
  );
}

function buildSummary(rules: DraftRule[], frequency: Frequency, rail: DeliveryRail) {
  if (rules.length === 0) {
    return "Pick the Theaters, Sectors, Threads and companies you want to follow.";
  }
  const counts = rules.reduce<Record<string, number>>((acc, r) => {
    acc[r.dimension] = (acc[r.dimension] ?? 0) + 1;
    return acc;
  }, {});
  const parts: string[] = [];
  const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? "" : "s"}`;
  if (counts.theme) parts.push(plural(counts.theme, "Theater"));
  if (counts.domain) parts.push(plural(counts.domain, "Sector"));
  if (counts.subdomain) parts.push(plural(counts.subdomain, "Thread"));
  if (counts.company) parts.push(plural(counts.company, "Company"));
  const cadence = { realtime: "real-time", daily: "daily digest", weekly: "weekly digest", monthly: "monthly digest" }[frequency];
  const railLabel = rail === "email_digest" ? "by email" : "in-app";
  return `${parts.join(", ")}, ${cadence} ${railLabel}. Ready to activate.`;
}
