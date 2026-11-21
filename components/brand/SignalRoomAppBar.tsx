"use client";

import { usePathname } from "next/navigation";
import { AppBar } from "@/lib/faraday-masthead/ui/Masthead.tsx";

// FDY-451: Signal Room's own top-level navigation, rendered in the shared
// masthead's AppBar. Signal Room has one routed surface today (the feed at
// /signal-room; "/" redirects there). Add the feed builder here when it gets a
// route of its own. `current` follows the URL so the bar stays right as
// routes are added.
const LINKS = [{ label: "Feed", href: "/signal-room" }];

export function SignalRoomAppBar() {
  const pathname = usePathname() ?? "";
  return (
    <AppBar
      label="Signal Room"
      links={LINKS.map((l) => ({
        ...l,
        current: pathname === l.href || pathname.startsWith(`${l.href}/`),
      }))}
    />
  );
}
