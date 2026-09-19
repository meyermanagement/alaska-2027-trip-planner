const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export function adultInviteEmail({ email, url }) {
  const subject = "Your own Alyeska access";
  const lines = [
    "You have been invited to set up your own adult traveler access in Alyeska.",
    `This invitation is for ${email}. You must be 18 or older.`,
    "Read the current agreement and privacy notice, accept for yourself, and choose your optional features. Your parent cannot accept on your behalf.",
    "You will remain a secondary traveler, with access to assigned, non-draft trips. Your existing traveler profile, saved theme, trips and packing lists will be kept.",
    "Nothing changes until you accept. This invitation expires in 48 hours. Do not forward it.",
    `Review your invitation: ${url}`,
  ];
  return { subject, text: lines.join("\n\n"), html: `<html><body style="font:16px/1.6 system-ui;color:#24333b;background:#f4f1e9;padding:24px"><main style="max-width:560px;margin:auto;background:white;padding:28px;border-radius:16px"><h1>Alyeska</h1>${lines.slice(0, -1).map(line => `<p>${escape(line)}</p>`).join("")}<p><a href="${escape(url)}" style="display:inline-block;background:#276b6c;color:white;padding:12px 20px;border-radius:24px">Review your invitation</a></p></main></body></html>` };
}
