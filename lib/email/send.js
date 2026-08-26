/**
 * One way out for outbound email, with two possible pipes behind it.
 *
 * Which pipe is used is decided entirely by environment variables, so the
 * transport can be swapped without touching a line of feature code:
 *
 *   Gmail    GMAIL_USER + GMAIL_APP_PASSWORD   (sends as that Gmail address)
 *   Resend   RESEND_API_KEY + EMAIL_FROM       (needs a domain you own)
 *
 * Set EMAIL_TRANSPORT to "gmail" or "resend" to force one when both are
 * present. With neither configured, sending fails loudly with a message the UI
 * can show, rather than pretending it worked.
 */

const GMAIL = "gmail";
const RESEND = "resend";

export function emailTransport() {
  const forced = (process.env.EMAIL_TRANSPORT || "").trim().toLowerCase();
  if (forced === GMAIL || forced === RESEND) return forced;
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) return GMAIL;
  if (process.env.RESEND_API_KEY) return RESEND;
  return null;
}

export function emailFrom() {
  const label = process.env.EMAIL_FROM_NAME || "Alyeska";
  const address =
    process.env.EMAIL_FROM ||
    (emailTransport() === GMAIL ? process.env.GMAIL_USER : null);
  if (!address) return null;
  return `${label} <${address}>`;
}

/**
 * @returns {Promise<{ok: true} | {ok: false, error: string}>}
 */
export async function sendEmail({ to, subject, html, text, replyTo }) {
  const transport = emailTransport();
  const from = emailFrom();

  if (!transport || !from) {
    return {
      ok: false,
      error:
        "Email sending is not set up on the server yet, so nothing was sent. The address is saved, though — they can sign in with Google using it right now.",
    };
  }

  try {
    if (transport === RESEND) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject,
          html,
          text,
          ...(replyTo ? { reply_to: replyTo } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, error: resendMessage(res.status, body) };
      }
      return { ok: true };
    }

    // Gmail over SMTP. Imported here rather than at the top so a Resend-only
    // deployment never has to load it.
    const nodemailer = (await import("nodemailer")).default;
    const mailer = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.GMAIL_USER,
        // Google displays app passwords in four spaced blocks; tolerate a paste.
        pass: (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, ""),
      },
    });
    await mailer.sendMail({ from, to, subject, html, text, replyTo });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

function resendMessage(status, body) {
  if (status === 403 && /testing emails/i.test(body)) {
    return "Resend will only deliver to your own account address until a domain you own is verified. Verify a domain, or switch to the Gmail sender.";
  }
  if (status === 401 || status === 403) {
    return "The email provider rejected the API key.";
  }
  if (status === 429) {
    return "The email provider is rate limiting us. Wait a minute and try again.";
  }
  return `The email provider returned an error (${status}).`;
}

function friendly(err) {
  const message = String(err?.message || err || "");
  if (
    /Invalid login|Username and Password not accepted|BadCredentials/i.test(
      message,
    )
  ) {
    return "Gmail rejected the app password. It has to be a 16-character app password from an account with 2-Step Verification turned on, not the account password.";
  }
  if (/Daily user sending limit|limit exceeded/i.test(message)) {
    return "Gmail's daily sending limit was hit. Try again tomorrow.";
  }
  return message || "The email could not be sent.";
}
