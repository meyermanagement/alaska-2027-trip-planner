// Production release approved September 19, 2026. Preview and local builds
// stay off unless explicitly enabled; an explicit false is the kill switch.
export function adultAccessEnabled(env = process.env) {
  if (env.ADULT_ACCESS_INVITES_ENABLED !== undefined)
    return env.ADULT_ACCESS_INVITES_ENABLED === "true";
  return env.VERCEL_ENV === "production";
}
