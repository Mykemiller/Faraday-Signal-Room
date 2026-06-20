import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MAX_RULES_PER_CONFIGURATION } from "@/lib/signal-room/types";

export const dynamic = "force-dynamic";

// Shape of a rule as submitted by the composer (one dimension per row).
interface IncomingRule {
  dimension: "theme" | "domain" | "subdomain" | "company" | "threshold";
  theme_code?: string | null;
  domain_code?: string | null;
  subdomain_code?: string | null;
  company_id?: string | null;
  threshold_spec?: Record<string, unknown> | null;
  frequency: "realtime" | "daily" | "weekly" | "monthly" | "threshold";
  delivery_rail?: "email_digest" | "in_app";
}

async function getSubscriber() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// GET /api/signal-room/configurations — list the caller's configurations + rules.
export async function GET() {
  const { supabase, user } = await getSubscriber();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("signal_configurations")
    .select(
      "id, status, activated_until, created_at, last_modified, signal_configuration_rules(*)",
    )
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ configurations: data });
}

// POST /api/signal-room/configurations — create a draft (status=inactive) config.
export async function POST(req: NextRequest) {
  const { supabase, user } = await getSubscriber();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | { rules?: IncomingRule[] }
    | null;
  const rules = body?.rules ?? [];

  if (rules.length > MAX_RULES_PER_CONFIGURATION) {
    return NextResponse.json(
      { error: "too_many_rules", max: MAX_RULES_PER_CONFIGURATION },
      { status: 400 },
    );
  }

  // Create the parent configuration (RLS sets/enforces ownership).
  const { data: config, error: configError } = await supabase
    .from("signal_configurations")
    .insert({ subscriber_id: user.id, status: "inactive" })
    .select("id")
    .single();

  if (configError || !config) {
    return NextResponse.json(
      { error: configError?.message ?? "create_failed" },
      { status: 500 },
    );
  }

  if (rules.length > 0) {
    const rows = rules.map((r, i) => ({
      configuration_id: config.id,
      dimension: r.dimension,
      theme_code: r.theme_code ?? null,
      domain_code: r.domain_code ?? null,
      subdomain_code: r.subdomain_code ?? null,
      company_id: r.company_id ?? null,
      threshold_spec: r.threshold_spec ?? null,
      frequency: r.frequency,
      delivery_rail: r.delivery_rail ?? "in_app",
      selection_order: i,
    }));

    const { error: rulesError } = await supabase
      .from("signal_configuration_rules")
      .insert(rows);

    if (rulesError) {
      // Roll back the orphaned parent so a failed rule insert leaves no trace.
      await supabase.from("signal_configurations").delete().eq("id", config.id);
      return NextResponse.json({ error: rulesError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ id: config.id, status: "inactive" }, { status: 201 });
}

// PATCH /api/signal-room/configurations — pause / resume / cancel (free, §7.2).
export async function PATCH(req: NextRequest) {
  const { supabase, user } = await getSubscriber();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | { id?: string; action?: "pause" | "resume" | "cancel" }
    | null;
  if (!body?.id || !body.action) {
    return NextResponse.json({ error: "id and action required" }, { status: 400 });
  }

  const statusByAction = {
    pause: "paused",
    resume: "active",
    cancel: "cancelled",
  } as const;

  const { error } = await supabase
    .from("signal_configurations")
    .update({ status: statusByAction[body.action], last_modified: new Date().toISOString() })
    .eq("id", body.id); // RLS guarantees the caller owns this row.

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
