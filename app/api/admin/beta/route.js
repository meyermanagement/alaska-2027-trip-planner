import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { whoIs } from "@/lib/supabase/who";
import { isAdminUser } from "@/lib/auth/admin";
import { betaInviteEmail } from "@/lib/email/betaInvite";
import { siteOrigin } from "@/lib/email/sendInvite";
import { sendEmail } from "@/lib/email/send";

/**
 * The one route behind the beta desk: mint codes, put a code against an address,
 * send that person their invitation, take a code back.
 *
 * All four are here rather than in four files because all four need the same two
 * things — the caller proved to be an owner, and the service-role client — and
 * splitting them would mean four copies of the gate. A gate copied four times is
 * a gate that will one day be right three times.
 *
 * Why service role at all, when everything else in this app leans on row-level
 * security: signup_codes has no policy that lets a signed-in person read
 * somebody else's code, and it must not get one. The desk needs to see all of
 * them, so it reads with the key and refuses anybody the allowlist does not
 * name. See lib/auth/admin.js.
 */

// No O, I, 0 or 1: these are read aloud and typed by hand on a phone.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function mintCode() {
  const block = () =>
    Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(
      "",
    );
  return `ALY-${block()}-${block()}`;
}

/** "Alex Rivera" becomes "Rivera Family", which is what their household opens as. */
function householdName(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length < 2) return "New Family";
  return `${parts[parts.length - 1]} Family`;
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || "").trim());
}

/** The caller, if they are allowed to be here. */
async function owner() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!isAdminUser(user)) return null;
  return user;
}

export async function POST(request) {
  const user = await owner();
  // Not 403. A page that does not exist for you should not tell you it exists
  // and is guarded, which is what the desk's own page does too.
  if (!user) return new NextResponse(null, { status: 404 });

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      {
        error:
          "The server has no service-role key set, so the beta desk cannot read or write codes.",
      },
      { status: 500 },
    );
  }

  let body = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const action = String(body?.action || "");

  if (action === "mint") {
    const count = Math.min(Math.max(Number(body?.count) || 1, 1), 20);
    const note = String(body?.note || "").slice(0, 200) || null;
    const rows = Array.from({ length: count }, () => ({
      code: mintCode(),
      family_name: "New Family",
      note,
    }));
    const { error } = await admin.from("signup_codes").insert(rows);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, codes: rows.map((r) => r.code) });
  }

  if (action === "unassign") {
    const code = String(body?.code || "").toUpperCase();
    const { error } = await admin
      .from("signup_codes")
      .update({
        assigned_email: null,
        assigned_name: null,
        assigned_at: null,
        assigned_by: null,
        sent_at: null,
        send_count: 0,
        family_name: "New Family",
      })
      .eq("code", code)
      .is("used_by", null);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "revoke") {
    const code = String(body?.code || "").toUpperCase();
    // Spent codes are the record of who joined and are never deleted. An unspent
    // one is retired by expiring it rather than removing the row, so a code that
    // was emailed to somebody remains explainable afterwards.
    const { error } = await admin
      .from("signup_codes")
      .update({ expires_at: new Date().toISOString() })
      .eq("code", code)
      .is("used_by", null);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action !== "invite") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  // Invite: one address, one code, one email.
  const email = String(body?.email || "")
    .trim()
    .toLowerCase();
  const name = String(body?.name || "").trim();
  const note = String(body?.note || "").trim();
  if (!looksLikeEmail(email)) {
    return NextResponse.json(
      { error: "That does not look like an email address." },
      { status: 400 },
    );
  }

  const asked = String(body?.code || "")
    .trim()
    .toUpperCase();

  // Already invited? Then this is a resend of their own code rather than a
  // second code for the same person, which is how a beta ends up with one
  // tester holding three ways in and two of them dead.
  const { data: theirs } = await admin
    .from("signup_codes")
    .select("code, used_by, expires_at, send_count")
    .eq("assigned_email", email)
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let code = theirs?.code || null;
  if (theirs?.used_by) {
    return NextResponse.json(
      {
        error:
          "That address already signed in with its code, so there is nothing left to send. Their activity is on the list below.",
      },
      { status: 400 },
    );
  }

  if (!code) {
    if (asked) {
      const { data: named } = await admin
        .from("signup_codes")
        .select("code, used_by, assigned_email")
        .eq("code", asked)
        .maybeSingle();
      if (!named || named.used_by || named.assigned_email) {
        return NextResponse.json(
          { error: "That code is already spent, assigned, or does not exist." },
          { status: 400 },
        );
      }
      code = named.code;
    } else {
      // The oldest free code first, so the batch gets used in the order it was
      // made rather than leaving a straggler behind forever.
      const { data: free } = await admin
        .from("signup_codes")
        .select("code")
        .is("used_by", null)
        .is("assigned_email", null)
        .is("expires_at", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      code = free?.code || mintCode();
      if (!free) {
        const { error } = await admin
          .from("signup_codes")
          .insert({ code, family_name: "New Family", note: "Beta desk" });
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
      }
    }
  }

  // The address the app is known by, never the deployment's own hostname: a
  // sign-in link on a vercel.app URL reads as a phishing attempt and stops
  // working on the next push. siteOrigin skips build hosts for exactly that
  // reason, and this route now asks it the same way reminders and family
  // invitations do.
  const siteUrl = siteOrigin(request);
  const mail = betaInviteEmail({
    name,
    email,
    code,
    siteUrl,
    note: note || null,
  });

  // Assigned before the send, not after. If the mail fails, the code is still
  // theirs and the desk can try again -- the alternative loses the pairing and
  // hands the same code to the next person.
  const { error: claimError } = await admin
    .from("signup_codes")
    .update({
      assigned_email: email,
      assigned_name: name || null,
      assigned_at: new Date().toISOString(),
      assigned_by: user.id,
      family_name: householdName(name),
    })
    .eq("code", code);
  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }

  const sent = await sendEmail({
    to: email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    replyTo: user.email,
  });

  if (!sent.ok) {
    return NextResponse.json(
      { error: sent.error, code, assigned: true },
      { status: 502 },
    );
  }

  await admin
    .from("signup_codes")
    .update({
      sent_at: new Date().toISOString(),
      send_count: (theirs?.send_count || 0) + 1,
    })
    .eq("code", code);

  return NextResponse.json({ ok: true, code, to: email });
}
