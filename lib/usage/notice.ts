/**
 * User-facing copy for the Signal Room daily limit (D12). No numbers (limits
 * are tuned in the Workbench), no upsell, no "limit"/"quota" language.
 * Call it in the BROWSER so {local time} is the viewer's own clock.
 */
export function usageNoticeText(
  resetAt: string | null | undefined,
  locale?: string,
  timeZone?: string,
): string {
  const lead = "You've changed today's set of signal settings.";
  const ms = resetAt ? Date.parse(resetAt) : Number.NaN;
  if (Number.isNaN(ms)) return `${lead} More open up tomorrow.`;
  const time = new Date(ms).toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  });
  return `${lead} More open up at ${time}.`;
}
