// Gemini may cite a Google redirect instead of the publisher URL printed in its
// answer. Resolve only that fixed provider host, never arbitrary model URLs.
export async function resolveGroundingUrls(sources, request = fetch) {
  return Promise.all((sources || []).slice(0, 6).map(async source => {
    let url;
    try { url = new URL(source.url); } catch { return source; }
    if (url.protocol !== "https:" || url.hostname !== "vertexaisearch.cloud.google.com" ||
        !url.pathname.startsWith("/grounding-api-redirect/")) return source;
    try {
      const response = await request(url.href, { redirect: "manual", signal: AbortSignal.timeout(3000), cache: "no-store" });
      const location = response.headers.get("location");
      if (![301, 302, 303, 307, 308].includes(response.status) || !location) return source;
      const target = new URL(location, url);
      // No request to the destination. It is used only as a citation match.
      if (["https:", "http:"].includes(target.protocol) && !target.username && !target.password)
        return { ...source, url: target.href, groundingUrl: source.url };
    } catch { /* Missing citation match means no alert, not a guessed source. */ }
    return source;
  }));
}
