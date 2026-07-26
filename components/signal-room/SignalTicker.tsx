"use client";

import { useEffect, useMemo, useState } from "react";
import {
  convictionTier,
  within24h,
  type ConvictionTier,
  type FeedSignal,
} from "@/lib/signal-room/live-feed";

const MAX_FRAMING = 90;

function truncate(text: string | null, max: number): string {
  if (!text) return "";
  const clean = text.trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function hhmmUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

/**
 * "Today's Signals" — a rolling 24h marquee. The window is computed after mount
 * (client `Date.now()`) so the time-dependent content never causes a hydration
 * mismatch. Pauses on hover; honors prefers-reduced-motion (CSS). Honest empty
 * state when nothing has fired in the last 24 hours.
 */
export function SignalTicker({
  signals,
  onSelect,
}: {
  signals: FeedSignal[];
  onSelect: (id: string) => void;
}) {
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => setNowMs(Date.now()), []);

  const recent = useMemo(
    () => (nowMs === null ? [] : within24h(signals, nowMs)),
    [signals, nowMs],
  );

  // Duration scales with item count so speed stays readable regardless of volume.
  const durationSec = Math.max(30, recent.length * 3);

  return (
    <section
      aria-label="Today's Signals — last 24 hours"
      className="mt-12 border-t border-cream pt-6"
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="eyebrow">Today&rsquo;s Signals</h2>
        {nowMs !== null && recent.length > 0 && (
          <span className="font-mono text-[11px] text-forest/50">
            {recent.length} in the last 24h
          </span>
        )}
      </div>

      {nowMs === null ? (
        <p className="text-sm text-forest/50">Loading today&rsquo;s Signals…</p>
      ) : recent.length === 0 ? (
        <p className="rounded-md border border-cream bg-white px-4 py-3 text-sm text-forest/60">
          No signals in the last 24 hours.
        </p>
      ) : (
        <div className="dc-ticker rounded-md border border-cream bg-forest">
          <div
            className="dc-ticker-track"
            style={{ animationDuration: `${durationSec}s` }}
          >
            {/* Two identical halves make the -50% loop seamless. */}
            <TickerRow items={recent} onSelect={onSelect} />
            <TickerRow items={recent} onSelect={onSelect} ariaHidden />
          </div>
        </div>
      )}
    </section>
  );
}

function TickerRow({
  items,
  onSelect,
  ariaHidden,
}: {
  items: FeedSignal[];
  onSelect: (id: string) => void;
  ariaHidden?: boolean;
}) {
  return (
    <div className="dc-ticker-row" aria-hidden={ariaHidden || undefined}>
      {items.map((s, i) => (
        <button
          key={`${s.id}-${i}`}
          onClick={() => onSelect(s.id)}
          tabIndex={ariaHidden ? -1 : 0}
          className="dc-ticker-item"
        >
          <span className="font-mono text-[11px] text-gold">{hhmmUtc(s.fired_at)}</span>
          <span className="text-[13px] text-warm-white/90">
            {truncate(s.framing, MAX_FRAMING)}
          </span>
          <TickerConviction value={s.conviction} />
        </button>
      ))}
    </div>
  );
}

function TickerConviction({ value }: { value: string | null }) {
  const tier = convictionTier(value);
  if (!tier) return null;
  const dot: Record<Exclude<ConvictionTier, null>, string> = {
    high: "bg-gold",
    medium: "bg-sage",
    low: "bg-cream",
  };
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.1em] text-warm-white/60">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot[tier]}`} />
      {tier}
    </span>
  );
}
