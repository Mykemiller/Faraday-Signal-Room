"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ALL,
  buildTaxonomyIndex,
  convictionTier,
  domainsForTheme,
  filterSignals,
  reconcileFilters,
  threadsFor,
  within24h,
  type ConvictionTier,
  type DomainRow,
  type FeedFilters,
  type FeedSignal,
  type SubdomainRow,
  type ThemeRow,
} from "@/lib/signal-room/live-feed";
import { SignalTicker } from "./SignalTicker";

const DEFAULT_FILTERS: FeedFilters = { theme: ALL, sector: ALL, thread: ALL };

export function SignalFeed({
  themes,
  domains,
  subdomains,
  signals,
  error,
}: {
  themes: ThemeRow[];
  domains: DomainRow[];
  subdomains: SubdomainRow[];
  signals: FeedSignal[];
  error: string | null;
}) {
  const index = useMemo(
    () => buildTaxonomyIndex(themes, domains, subdomains),
    [themes, domains, subdomains],
  );

  const [filters, setFilters] = useState<FeedFilters>(DEFAULT_FILTERS);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // Cascading option lists (Decision 3).
  const sectorOptions = useMemo(
    () => domainsForTheme(index, filters.theme),
    [index, filters.theme],
  );
  const threadOptions = useMemo(
    () => threadsFor(index, filters.theme, filters.sector),
    [index, filters.theme, filters.sector],
  );

  const filtered = useMemo(
    () => filterSignals(signals, filters),
    [signals, filters],
  );

  function update(patch: Partial<FeedFilters>) {
    setFilters((prev) => reconcileFilters(index, { ...prev, ...patch }));
  }

  function jumpToSignal(id: string) {
    if (typeof document === "undefined") return;
    const el = document.getElementById(`signal-${id}`);
    if (!el) return; // filtered out of the main list — no-op (Decision 4)
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightId(id);
    window.setTimeout(() => setHighlightId((cur) => (cur === id ? null : cur)), 2000);
  }

  if (error === "not_configured") {
    return (
      <Notice>
        The live feed is not configured for this environment. Set{" "}
        <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code>SUPABASE_SERVICE_ROLE_KEY</code> to load Signals.
      </Notice>
    );
  }
  if (error) {
    return (
      <Notice>
        We couldn&rsquo;t load Signals right now. Please refresh in a moment.
      </Notice>
    );
  }

  const filtersActive =
    filters.theme !== ALL || filters.sector !== ALL || filters.thread !== ALL;

  return (
    <div>
      {/* ── Filter bar ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FilterSelect
          label="Theater"
          value={filters.theme}
          onChange={(v) => update({ theme: v })}
          allLabel="All Theaters"
          options={themes.map((t) => ({ value: t.theme_code, label: t.name }))}
        />
        <FilterSelect
          label="Sector"
          value={filters.sector}
          onChange={(v) => update({ sector: v })}
          allLabel="All Sectors"
          options={sectorOptions.map((d) => ({
            value: d.domain_code,
            label: d.emoji ? `${d.emoji} ${d.domain_name}` : d.domain_name,
          }))}
        />
        <FilterSelect
          label="Threads"
          value={filters.thread}
          onChange={(v) => update({ thread: v })}
          allLabel="All Threads"
          options={threadOptions.map((s: SubdomainRow) => ({
            value: s.subdomain_code,
            label: s.display_name,
          }))}
        />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-forest/60">
          {filtered.length} Signal{filtered.length === 1 ? "" : "s"}
          {filtersActive ? ` of ${signals.length}` : ""}
        </p>
        {filtersActive && (
          <button
            onClick={() => setFilters(DEFAULT_FILTERS)}
            className="text-xs text-gold hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* ── Signal list (newest first) ─────────────────────────────────── */}
      <div className="mt-4 space-y-4">
        {signals.length === 0 && (
          <Notice>No Signals have been published yet.</Notice>
        )}
        {signals.length > 0 && filtered.length === 0 && (
          <Notice>No Signals match these filters. Try widening your selection.</Notice>
        )}
        {filtered.map((s) => (
          <SignalCard key={s.id} signal={s} highlighted={highlightId === s.id} />
        ))}
      </div>

      {/* ── Today's Signals ticker ─────────────────────────────────────── */}
      <SignalTicker signals={signals} onSelect={jumpToSignal} />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  allLabel,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  allLabel: string;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-sage/50 bg-white px-3 py-2 text-sm text-forest focus:border-gold focus:outline-none"
      >
        <option value={ALL}>{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SignalCard({
  signal,
  highlighted,
}: {
  signal: FeedSignal;
  highlighted: boolean;
}) {
  const firedAt = new Date(signal.fired_at);
  return (
    <article
      id={`signal-${signal.id}`}
      className={
        "rounded-lg border bg-white p-5 transition-colors " +
        (highlighted ? "border-gold ring-2 ring-gold/40" : "border-cream")
      }
    >
      <div className="flex items-start justify-between gap-3">
        <time
          dateTime={signal.fired_at}
          className="font-mono text-[11px] uppercase tracking-[0.1em] text-forest/60"
        >
          {formatTimestamp(firedAt)}
        </time>
        <ConvictionBadge value={signal.conviction} />
      </div>

      {signal.framing && (
        <p className="mt-2 font-serif text-[17px] leading-snug text-forest">
          {signal.framing}
        </p>
      )}

      {signal.faradaysTake && signal.faradaysTake !== signal.framing && (
        <p className="mt-2 text-[14px] leading-relaxed text-forest/80">
          {signal.faradaysTake}
        </p>
      )}

      <p className="mt-3 font-mono text-[11px] text-forest/50">
        {signal.byline ? `${signal.byline}` : "Faraday"}
        {signal.source ? ` · ${signal.source}` : ""}
      </p>
    </article>
  );
}

function ConvictionBadge({ value }: { value: string | null }) {
  const tier = convictionTier(value);
  if (!tier) return null; // never fabricate a conviction
  const styles: Record<Exclude<ConvictionTier, null>, string> = {
    high: "bg-gold text-forest border-gold",
    medium: "bg-sage/25 text-forest border-sage/60",
    low: "bg-cream text-forest/70 border-sage/30",
  };
  const label = tier.charAt(0).toUpperCase() + tier.slice(1);
  return (
    <span
      className={
        "shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] " +
        styles[tier]
      }
      title="Faraday conviction"
    >
      {label}
    </span>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-cream bg-white p-5 text-sm text-forest/70">
      {children}
    </div>
  );
}

export function formatTimestamp(d: Date): string {
  if (Number.isNaN(d.getTime())) return "";
  const day = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
  return `${day} · ${time} UTC`;
}
