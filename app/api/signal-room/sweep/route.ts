import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  filterMatchingSignals,
  collapseDigest,
} from "@/lib/signal-room/matching";
import { toSubscriberSignals, assertNoConviction } from "@/lib/signal-room/serialize";
import { sendDigestEmail, buildDigestText, buildDigestHtml } from "@/lib/mail";
import type { ConfigurationRule, SubscriberSignal } from "@/lib/signal-room/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/signal-room/sweep
 *
 * Delivery sweep (P5): reads all active configurations, matches recent Signals
 * against each via OR-union (§4.4, item 4), and routes to email + in-app.
 *
 * Protected by a shared secret (SWEEP_SECRET) — called by a Supabase Edge
 * Function cron or an external scheduler, never from the browser.
 *
 * Conviction never reaches a subscriber payload (view + serializer, items 3).
 * Digest collapses at >20 matches (item 6).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.SWEEP_SECRET;
  if (secret) {
    const auth = req.headers.get("x-sweep-secret");
    if (auth !== secret) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Fetch recent signals through the conviction-free view only (item 3).
  const { data: recentSignals, error: sigErr } = await supabase
    .from("subscriber_signals")
    .select("*")
    .order("fired_at", { ascending: false })
    .limit(200);

  if (sigErr) {
    return NextResponse.json({ error: sigErr.message }, { status: 500 });
  }

  // Load all active configurations with their rules.
  const { data: configs, error: cfgErr } = await supabase
    .from("signal_configurations")
    .select(
      "id, subscriber_id, signal_configuration_rules(*)",
    )
    .eq("status", "active")
    .gt("activated_until", new Date().toISOString());

  if (cfgErr) {
    return NextResponse.json({ error: cfgErr.message }, { status: 500 });
  }

  const signals = (recentSignals ?? []) as SubscriberSignal[];
  const results: Array<{ config_id: string; matched: number; sent: string[] }> = [];

  for (const config of configs ?? []) {
    const rules = (config.signal_configuration_rules ?? []) as ConfigurationRule[];
    const activeRules = rules.filter((r) => !r.paused);
    if (activeRules.length === 0) continue;

    const matched = filterMatchingSignals(activeRules, signals);
    if (matched.length === 0) continue;

    const serialized = toSubscriberSignals(matched);
    assertNoConviction(serialized); // defense-in-depth guard

    const digest = collapseDigest(serialized);
    const inAppUrl = `${process.env.SIGNAL_ROOM_URL ?? "https://faraday-intelligence.ai"}/signal-room`;

    const sent: string[] = [];

    // --- In-app rail: upsert into a feed table if it exists, else log ---
    try {
      await supabase.from("signal_feed").insert(
        digest.signals.map((s) => ({
          subscriber_id: config.subscriber_id,
          configuration_id: config.id,
          signal_id: s.id,
          delivered_at: new Date().toISOString(),
        })),
      );
      sent.push("inapp");
    } catch {
      // signal_feed table may not exist yet; log and continue
      console.log(`[sweep] in-app insert skipped for config ${config.id}`);
    }

    // --- Email rail ---
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", config.subscriber_id)
      .single();

    const emailAddress = profile?.email as string | null;
    if (emailAddress) {
      const framings = digest.signals.map(
        (s) => s.framing ?? "(no framing)",
      );
      const result = await sendDigestEmail({
        to: emailAddress,
        subject: "Your Faraday Signal digest",
        text: buildDigestText(framings, digest.collapsed, digest.totalMatched, inAppUrl),
        html: buildDigestHtml(framings, digest.collapsed, digest.totalMatched, inAppUrl),
      });
      if (result.ok) sent.push("email");
    }

    results.push({ config_id: config.id, matched: matched.length, sent });
  }

  return NextResponse.json({
    ok: true,
    configs_processed: (configs ?? []).length,
    results,
  });
}
