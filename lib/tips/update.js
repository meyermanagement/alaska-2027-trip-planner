// Header visibility and the underlying advice are independent decisions.
export function tipUpdate(body, userId, now = new Date().toISOString()) {
  if (Object.hasOwn(body || {}, "header_hidden")) {
    if (typeof body.header_hidden !== "boolean" || Object.hasOwn(body, "status"))
      return null;
    return { header_hidden_at: body.header_hidden ? now : null };
  }
  if (body?.status === "active")
    return { status: "active", resolved_by: null, resolved_at: null, header_hidden_at: null };
  if (body?.status === "cleared")
    return { status: "cleared", resolved_by: userId, resolved_at: now };
  return null;
}

export function visibleHeaderTips(tips = []) {
  return tips.filter((tip) => !tip.header_hidden_at);
}
