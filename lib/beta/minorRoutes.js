// Exact allowlist. No blanket /auth, /api or /login prefix bypass.
export function minorRouteAllowed(path, method = "GET") {
  if (method !== "GET" && method !== "HEAD") return false;
  return ["/child", "/api/child", "/auth/callback", "/auth/land"].includes(path);
}
