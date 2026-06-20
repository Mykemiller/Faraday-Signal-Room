import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readSignalRoomMeter } from "@/lib/signal-room/meter";

export const dynamic = "force-dynamic";

/**
 * POST /api/signal-room/activate  { configuration_id }
 *
 * Reads the config-driven meter, then calls signal_room_activate, which burns
 * atomically through wallet_burn and flips the configuration to active for the
 * 30-day window (§7.2). Insufficient balance returns 402 with a purchase CTA
 * hint. The numeric cost is only surfaced when the meter is 'final' (§5.4).
 */
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | { configuration_id?: string }
    | null;
  if (!body?.configuration_id) {
    return NextResponse.json({ error: "configuration_id required" }, { status: 400 });
  }

  const meter = await readSignalRoomMeter(supabase);

  const { data, error } = await supabase.rpc("signal_room_activate", {
    p_config_id: body.configuration_id,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = data as Record<string, unknown>;

  if (result?.error === "insufficient_tokens") {
    return NextResponse.json(
      {
        error: "insufficient_tokens",
        // cost is shown only when the meter is signed off (FAR-46); else hidden.
        cost: meter.isPublic ? result.cost : undefined,
        balance: result.balance,
        purchase_cta: "/wallet/tokens",
      },
      { status: 402 },
    );
  }
  if (result?.error === "forbidden") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (result?.error === "not_found") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (result?.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    cached: result.cached ?? false,
    activated_until: result.unlocked_until,
    balance: result.balance,
  });
}
