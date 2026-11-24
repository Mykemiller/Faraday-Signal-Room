"use client";

import { usageNoticeText } from "@/lib/usage/notice";

/**
 * Friendly notice shown when today's signal settings are used up (FDY-394).
 * `resetAt` comes from the server (next UTC midnight); it renders in the
 * viewer's local time.
 */
export function UsageNotice({ resetAt }: { resetAt: string | null }) {
  return (
    <p role="status" className="mt-3 text-sm text-forest/80">
      {usageNoticeText(resetAt)}
    </p>
  );
}
