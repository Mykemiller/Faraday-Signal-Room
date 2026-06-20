/**
 * Feature flag for the live Signal Room surface (§7.3, §11 P5).
 * Default OFF. Flipped to "true" only after the launch gates pass
 * (FAR-44 wallet / FAR-46 meter lock / FAR-16 readiness).
 */
export function isSignalRoomLive(): boolean {
  return process.env.NEXT_PUBLIC_SIGNAL_ROOM_LIVE === "true";
}
