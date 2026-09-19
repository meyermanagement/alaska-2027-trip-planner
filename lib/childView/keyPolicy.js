// Refreshing a JWT is NOT a fresh sign-in. Use verified authentication-method time.
export function hasFreshParentSignIn(claims, now = Date.now()) {
  return Array.isArray(claims?.amr) && claims.amr.some(entry =>
    ["password", "oauth", "sso/saml", "mfa/totp", "mfa/webauthn"].includes(entry?.method)
    && Number.isFinite(entry.timestamp) && now / 1000 - entry.timestamp >= 0
    && now / 1000 - entry.timestamp <= 300);
}
export function normalizeRecoveryCode(value) {
  return typeof value === "string" ? value.replace(/[\s-]/g, "").toUpperCase() : "";
}
export function validRecoveryCode(value) { return /^[A-F0-9]{48}$/.test(normalizeRecoveryCode(value)); }
export function parentKeyLabel(value) { return String(value || "Parent passkey").trim().slice(0, 60) || "Parent passkey"; }
