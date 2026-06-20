import type { SupabaseClient } from "@supabase/supabase-js";
import { PRODUCT_KEY } from "./types";

/**
 * Reads the Signal Room meter cost at runtime from product_meters
 * (config-driven, FAR-46). The literal value (currently 10, draft) appears
 * NOWHERE in code — a unit test forbids it (§5.4, §13).
 *
 * Returns the cost plus the meter status. While status !== 'final' the
 * per-product price is treated as draft and is NOT exposed publicly (§5.4,
 * FAR-119): callers should hide the numeric cost on subscriber surfaces.
 */
export interface MeterInfo {
  productKey: string;
  tokensCost: number;
  status: string;
  /** True only when the meter is signed off by FAR-46; gates public display. */
  isPublic: boolean;
}

export async function readSignalRoomMeter(
  supabase: SupabaseClient,
): Promise<MeterInfo> {
  const { data, error } = await supabase
    .from("product_meters")
    .select("product_key, tokens_cost, status")
    .eq("product_key", PRODUCT_KEY)
    .single();

  if (error || !data) {
    throw new Error(
      `Signal Room meter not found in product_meters (product_key='${PRODUCT_KEY}'): ${error?.message ?? "no row"}`,
    );
  }

  return {
    productKey: data.product_key,
    tokensCost: data.tokens_cost,
    status: data.status,
    isPublic: data.status === "final",
  };
}
