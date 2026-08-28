import "server-only";

/**
 * Transactional email via the Resend HTTP API (architecture.md §14.4). No SDK —
 * a single `fetch` keeps the dependency surface flat. Dormant until
 * `RESEND_API_KEY` and `EMAIL_FROM` are set, so the chat feature ships and runs
 * before email is provisioned.
 */

type SendResult =
  | { ok: true; id: string }
  | { ok: false; skipped: "not-configured" }
  | { ok: false; error: string };

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function send(payload: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return { ok: false, skipped: "not-configured" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, ...payload }),
    });
    if (!res.ok) {
      return { ok: false, error: `Resend ${res.status}: ${await res.text()}` };
    }
    const data = (await res.json()) as { id: string };
    return { ok: true, id: data.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** specs §15.5 — "you have unread messages" nudge for an away recipient. */
export async function sendChatNudgeEmail(opts: {
  to: string;
  recipientName: string;
  senderName: string;
  snippet: string;
  threadUrl: string;
}): Promise<SendResult> {
  const { to, recipientName, senderName, snippet, threadUrl } = opts;
  const subject = `New message from ${senderName} on Tailmap`;
  const trimmed = snippet.length > 140 ? `${snippet.slice(0, 139)}…` : snippet;

  const text = [
    `Hi ${recipientName},`,
    ``,
    `${senderName} sent you a message on Tailmap:`,
    ``,
    `  ${trimmed}`,
    ``,
    `Reply: ${threadUrl}`,
    ``,
    `You're getting this because you have unread messages and email notifications are on. Turn them off in Settings.`,
  ].join("\n");

  const html = `
    <div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#201e1d">
      <p>Hi ${escapeHtml(recipientName)},</p>
      <p><strong>${escapeHtml(senderName)}</strong> sent you a message on Tailmap:</p>
      <blockquote style="margin:0;padding:10px 14px;border-left:3px solid #728157;background:#f4f1ec">
        ${escapeHtml(trimmed)}
      </blockquote>
      <p><a href="${escapeHtml(threadUrl)}" style="color:#728157;font-weight:600">Open the conversation →</a></p>
      <p style="font-size:12px;color:#8a847c">
        You're getting this because you have unread messages and email notifications are on.
        Turn them off in Settings.
      </p>
    </div>`;

  return send({ to, subject, text, html });
}
