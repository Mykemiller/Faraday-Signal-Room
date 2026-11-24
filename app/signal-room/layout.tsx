import { headers } from "next/headers";
import GatePage from "@/lib/faraday-gate/ui/GatePage.tsx";
import { Masthead } from "@/lib/faraday-masthead/ui/Masthead.tsx";
import { SignalRoomAppBar } from "@/components/brand/SignalRoomAppBar";
import { signalRoomAppEmail } from "@/lib/faraday-gate-app-email";
import {
  SIGNALROOM_APP,
  SIGNALROOM_APP_NAME,
  SIGNALROOM_GATE_COPY,
  SIGNALROOM_PRIVACY_URL,
  SIGNALROOM_TERMS_URL,
  guardSignalRoom,
} from "@/lib/faradayGate";

// FDY-419 (ADM-1.7c): the Faraday beta access gate wraps the /signal-room route group.
// In mode "open" (the seeded default) it passes straight through and the masthead, AppBar and
// page render exactly as before (they moved here from app/layout.tsx so a gated visitor sees the
// gate's own masthead once, not two). A probe error (env missing, RPC unreachable) also passes
// through unless FARADAY_GATE_ENFORCE=1 (lib/faradayGate.ts). force-dynamic + headers() keep the
// gate a per-request decision: a build with no Supabase env must not prerender a frozen answer.
export const dynamic = "force-dynamic";

export default async function SignalRoomLayout({ children }: { children: React.ReactNode }) {
  const gate = await guardSignalRoom({ cookieHeader: headers().get("cookie"), appEmail: signalRoomAppEmail });
  if (!gate.pass) {
    return (
      <GatePage
        app={SIGNALROOM_APP}
        appName={SIGNALROOM_APP_NAME}
        copy={SIGNALROOM_GATE_COPY}
        view={gate.view}
        email={gate.email}
        termsUrl={SIGNALROOM_TERMS_URL}
        privacyUrl={SIGNALROOM_PRIVACY_URL}
      />
    );
  }
  // gate.email is null in mode "open" (no identity lookup), so the masthead shows "Sign in" as before.
  return (
    <>
      <Masthead appName="Signal Room" homeHref="/signal-room" signInHref="/signal-room" email={gate.email} loadFonts />
      <SignalRoomAppBar />
      {children}
    </>
  );
}
