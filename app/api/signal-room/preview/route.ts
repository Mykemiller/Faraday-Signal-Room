import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toSubscriberSignals, assertNoConviction } from "@/lib/signal-room/serialize";
import { filterMatchingSignals, collapseDigest } from "@/lib/signal-room/matching";
import type { ConfigurationRule } from "@/lib/signal-room/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/signal-room/preview  { rules: ConfigurationRule[] }  (or { configuration_id })
 *
 * The test-signal sampler (§9.2): returns what the configuration WOULD have
 * delivered over a recent window — conviction stripped at two layers (the
 * subscriber_signals view, then the serializer + assertNoConviction backstop).
 */
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | { rules?: ConfigurationRule[]; configuration_id?: string }
    | null;

  let rules: ConfigurationRule[] = body?.rules ?? [];

  // If a configuration_id is given, load its rules (RLS scopes to the caller).
  if (body?.configuration_id) {
    const { data, error } = await supabase
      .from("signal_configuration_rules")
      .select("*")
      .eq("configuration_id", body.configuration_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    rules = (data ?? []) as ConfigurationRule[];
  }

  // Read recent signals through the conviction-free VIEW only (never the base
  // table). The DB has already stripped conviction; we filter + serialize.
  const { data: recent, error: signalsError } = await supabase
    .from("subscriber_signals")
    .select("*")
    .order("fired_at", { ascending: false })
    .limit(200);

  if (signalsError) {
    return NextResponse.json({ error: signalsError.message }, { status: 500 });
  }

  const matched = filterMatchingSignals(rules, recent ?? []);
  const serialized = toSubscriberSignals(matched);
  const digest = collapseDigest(serialized);

  // Defense-in-depth contract check before the payload leaves the server.
  assertNoConviction(digest);

  return NextResponse.json(digest);
}
