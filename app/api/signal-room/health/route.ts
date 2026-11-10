import { NextResponse } from "next/server";
import { FEED_TTL_SECONDS, SIGNAL_LIMIT, getRawFeed } from "@/lib/signal-room/feed-source";
import { buildHealth } from "@/lib/signal-room/health";
import { isSignalRoomLive } from "@/lib/signal-room/flags";

export const dynamic = "force-dynamic";

/**
 * GET /api/signal-room/health
 *
 * Public, read-only, counts only. Answers "would /signal-room render a
 * populated feed right now?" from the same 5-minute cache the page reads, so
 * the Faraday home-page tile and the Workbench tile can show real status
 * instead of a hardcoded "Live".
 *
 * 200 when the feed is healthy, 503 otherwise — a probe that only checks the
 * status code still gets the right answer. CORS is open because the Workbench
 * reads this from the browser and the body carries nothing sensitive.
 */
export async function GET() {
  const raw = await getRawFeed();
  const health = buildHealth(raw, {
    nowMs: Date.now(),
    live: isSignalRoomLive(),
    window: SIGNAL_LIMIT,
  });

  return NextResponse.json(health, {
    status: health.ok ? 200 : 503,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": `public, max-age=60, s-maxage=${FEED_TTL_SECONDS}`,
    },
  });
}
