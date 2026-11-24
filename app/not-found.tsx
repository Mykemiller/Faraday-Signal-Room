import { Masthead } from "@/lib/faraday-masthead/ui/Masthead.tsx";
import { SignalRoomAppBar } from "@/components/brand/SignalRoomAppBar";

// FDY-419: the masthead and AppBar moved from app/layout.tsx into app/signal-room/layout.tsx (so the
// access gate can replace them). Unknown URLs keep the shared chrome through this page.
export default function NotFound() {
  return (
    <>
      <Masthead appName="Signal Room" homeHref="/signal-room" signInHref="/signal-room" loadFonts />
      <SignalRoomAppBar />
      <main id="main" className="mx-auto max-w-5xl px-5 py-10">
        <h1 className="font-serif text-3xl font-semibold">404</h1>
        <p className="mt-2 text-forest">This page could not be found.</p>
      </main>
    </>
  );
}
