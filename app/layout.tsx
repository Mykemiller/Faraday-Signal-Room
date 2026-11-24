import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Signal Room — Faraday Intelligence",
  description:
    "Faraday's live Signal feed — every Signal fired across the buildout, filterable by Theater, Sector and Thread.",
};

// FDY-451 · CC-BRAND-MASTHEAD-1.0: the shared Faraday masthead (vendored at
// lib/faraday-masthead — never edit it there) sits on every page, with the
// app's own navigation in the AppBar directly underneath. Each page's <main>
// carries id="main" for the masthead's skip link.
//
// FDY-419: the masthead + AppBar now render in app/signal-room/layout.tsx
// (behind the Faraday access gate, which shows its own masthead when it
// closes) and in app/not-found.tsx. "/" only redirects to /signal-room.
// "Sign in" points at the app's own home; the masthead loads IBM Plex Serif /
// Bricolage Grotesque / IBM Plex Mono itself (loadFonts).
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
