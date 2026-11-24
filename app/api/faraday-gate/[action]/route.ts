// FDY-419 (ADM-1.7c) — the Faraday gate's server actions for Signal Room.
//   POST /api/faraday-gate/code     { email }                  email a one-time code
//   POST /api/faraday-gate/verify   { email, code }            verify it; sets the httpOnly fgate_at cookie
//   POST /api/faraday-gate/request  { email, kind, message? }  Request demo access / Join the waitlist
//   POST /api/faraday-gate/signout                             clears the cookie
// All logic is the vendored package (lib/faraday-gate/server/handlers.ts): same-origin only,
// POST only, 5 requests per IP per hour. The app is fixed to "signalroom" here.
// Nothing here is reachable from the UI while the seeded mode is "open" (the gate never renders).
import { handleGateAction } from "@/lib/faraday-gate/server/handlers.ts";
import { SIGNALROOM_APP, gateConfig } from "@/lib/faradayGate";

export const dynamic = "force-dynamic";

type Ctx = { params: { action: string } };

export async function POST(req: Request, { params }: Ctx): Promise<Response> {
  return handleGateAction(req, params.action, SIGNALROOM_APP, gateConfig());
}

export async function GET(req: Request, { params }: Ctx): Promise<Response> {
  return handleGateAction(req, params.action, SIGNALROOM_APP, gateConfig()); // answers 405
}
