import type { Metadata } from "next";
import { Masthead } from "@/lib/faraday-masthead/ui/Masthead.tsx";
import { SignalRoomAppBar } from "@/components/brand/SignalRoomAppBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Signal Room — Faraday Intelligence",
  description:
    "Faraday's live Signal feed — every Signal fired across the buildout, filterable by Theater, Sector and Thread.",
};

// FDY-451 · CC-BRAND-MASTHEAD-1.0: the shared Faraday masthead (vendored at
// lib/faraday-masthead — never edit it there) sits on every route, with the
// app's own navigation in the AppBar directly underneath. Each page's <main>
// carries id="main" for the masthead's skip link.
//
// No email is passed: this app has no sign-in surface and no page reads the
// signed-in user, so "Sign in" points at the app's own home rather than a 404.
// The app does not load IBM Plex Serif / Bricolage Grotesque / IBM Plex Mono
// itself, so the masthead brings them (loadFonts).
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Masthead
          appName="Signal Room"
          homeHref="/signal-room"
          signInHref="/signal-room"
          loadFonts
        />
        <SignalRoomAppBar />
        {children}
      </body>
    </html>
  );
}
