/**
 * Email adapter for Signal Room digest delivery (P5).
 * Backed by Resend when RESEND_API_KEY is set; log-noop otherwise so the
 * build never blocks on a missing key.
 */

export interface DigestEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export async function sendDigestEmail(email: DigestEmail): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log(
      `[mail] RESEND_API_KEY not set — log-noop for digest to ${email.to}`,
    );
    return { ok: true, id: "noop" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_ADDRESS ?? "signals@faraday-intelligence.ai",
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[mail] Resend error ${res.status}: ${body}`);
      return { ok: false, error: `resend_${res.status}` };
    }

    const data = (await res.json()) as { id?: string };
    return { ok: true, id: data.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[mail] send failed: ${msg}`);
    return { ok: false, error: msg };
  }
}

/**
 * Build a plain-text digest body from a list of signal framings.
 * Called by the sweep before sendDigestEmail.
 */
export function buildDigestText(
  framings: string[],
  collapsed: boolean,
  totalMatched: number,
  inAppUrl: string,
): string {
  const lines: string[] = ["Your Faraday Signal digest\n"];
  framings.forEach((f, i) => lines.push(`${i + 1}. ${f}`));
  if (collapsed) {
    lines.push(
      `\n+${totalMatched - framings.length} more signals available at ${inAppUrl}`,
    );
  }
  return lines.join("\n");
}

export function buildDigestHtml(
  framings: string[],
  collapsed: boolean,
  totalMatched: number,
  inAppUrl: string,
): string {
  const items = framings
    .map((f) => `<li style="margin-bottom:8px">${escHtml(f)}</li>`)
    .join("\n");
  const overflow = collapsed
    ? `<p style="margin-top:16px"><a href="${inAppUrl}">See all ${totalMatched} signals in Signal Room →</a></p>`
    : "";
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px">
<h2 style="font-family:serif;color:#1C3424">Your Signal digest</h2>
<ul style="padding-left:20px">${items}</ul>
${overflow}
<hr style="margin-top:32px;border:none;border-top:1px solid #EEE6DA"/>
<p style="font-size:12px;color:#888">Faraday Intelligence · <a href="${inAppUrl}">Manage your Signal Room</a></p>
</body></html>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
