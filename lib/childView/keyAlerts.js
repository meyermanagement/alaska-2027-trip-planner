import { sendEmail } from "@/lib/email/send";

const descriptions = {
  add: "A backup parent passkey was added.",
  remove: "A parent passkey was removed.",
  "recovery-code": "Your parent-access recovery code was created or replaced. The previous code no longer works.",
  recover: "Your parent passkeys were replaced using recovery. Previous passkeys and recovery codes no longer work. Open child views were closed and saved parent approvals were revoked.",
};
export async function deliverParentKeyAlerts(admin, parentId = null, send = sendEmail) {
  let query = admin.from("parent_key_alerts").select("id,guardian_user_id,kind,created_at,attempts")
    .is("sent_at", null).or(`claimed_until.is.null,claimed_until.lt.${new Date().toISOString()}`)
    .order("created_at").limit(20);
  if (parentId) query = query.eq("guardian_user_id", parentId);
  const { data, error } = await query;
  if (error) return { sent: 0, pending: true };
  let sent = 0, pending = false;
  for (const row of data || []) {
    const lease = new Date(Date.now() + 300000).toISOString();
    const claimed = await admin.from("parent_key_alerts").update({ claimed_until: lease, attempts: row.attempts + 1 })
      .eq("id", row.id).is("sent_at", null)
      .or(`claimed_until.is.null,claimed_until.lt.${new Date().toISOString()}`).select("id").maybeSingle();
    if (claimed.error || !claimed.data) { pending = true; continue; }
    try {
      const { data: account, error: accountError } = await admin.auth.admin.getUserById(row.guardian_user_id);
      const email = account?.user?.email;
      const text = `Alyeska parent-access security\n\n${descriptions[row.kind]}\n\nRecorded: ${row.created_at}\n\nIf this was not you, contact admin@alyeska.app immediately and secure your adult account. Sign in on your own browser to review Family > Child trip views.\n\nWe will never ask you to email your recovery code or passkey.`;
      const result = !accountError && email ? await send({ to: email, subject: "Alyeska: parent access changed", text }) : { ok: false };
      if (result.ok) {
        const saved = await admin.from("parent_key_alerts").update({ sent_at: new Date().toISOString(), claimed_until: null })
          .eq("id", row.id).eq("claimed_until", lease);
        if (saved.error) pending = true; else sent++;
      } else {
        pending = true;
        await admin.from("parent_key_alerts").update({ claimed_until: null }).eq("id", row.id).eq("claimed_until", lease);
      }
    } catch { pending = true; } // lease expires; next scheduled run retries
  }
  // Short-lived operational records, not a permanent activity history.
  await admin.from("parent_key_alerts").delete().lt("created_at", new Date(Date.now() - 30 * 86400000).toISOString()).not("sent_at", "is", null);
  await admin.from("parent_key_grants").delete().lt("expires_at", new Date().toISOString());
  return { sent, pending };
}
