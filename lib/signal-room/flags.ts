/**
 * Feature flag for the live Signal Room surface (§7.3, §11 P5).
 * Default OFF. Flipped to "true" only after the launch gates pass
 * (FAR-44 wallet / FAR-46 meter lock / FAR-16 readiness).
 */
import { createResolver, resolveSettings, type Resolver } from "@/lib/config/resolver";

/** The env value: the fail-closed fallback (literal "true" only). */
export function isSignalRoomLive(): boolean {
  return process.env.NEXT_PUBLIC_SIGNAL_ROOM_LIVE === "true";
}

/**
 * FDY-297 (ADM-2.4). SERVER-ONLY. The flag as data: app SR, key `signal_room_live` in the Faraday config store.
 * A value set in the Workbench console wins within 60 s, no redeploy. On any read failure, an unknown key, a
 * wrong-typed value, or when nobody has set a value, the env value above is used (default OFF).
 */
export const SIGNAL_ROOM_APP_CODE = "SR";
export const SIGNAL_ROOM_SETTING_SPECS = {
  live: { key: "signal_room_live", type: "boolean" as const, env: isSignalRoomLive },
};

const resolver = createResolver();

export async function signalRoomLive(r: Pick<Resolver, "resolve"> = resolver): Promise<boolean> {
  const got = await resolveSettings(r, SIGNAL_ROOM_APP_CODE, SIGNAL_ROOM_SETTING_SPECS);
  return got.values.live;
}
