// A fixed order, whatever order the assistant asked in, so the list reads the
// same for every assistant. Anything unrecognized goes last, as sent.
const SCOPE_ORDER = ["openid", "profile", "email", "phone", "offline_access"];

export function orderScopes(scopes) {
  const rank = (s) => (SCOPE_ORDER.includes(s) ? SCOPE_ORDER.indexOf(s) : SCOPE_ORDER.length);
  return [...new Set(scopes)].sort((a, b) => rank(a) - rank(b));
}
