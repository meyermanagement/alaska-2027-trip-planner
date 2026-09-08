/**
 * Alyeska service worker.
 *
 * Its one job is to keep documents openable when the phone is offline. Nothing
 * else in this app requires a service worker to function -- the plans, the
 * packing lists, the reminders all live on the server. Documents are the
 * exception: a passport image or a boarding pass has to open at a hotel gate
 * where the wifi is nominally free and actually unusable.
 *
 * The strategy is stale-while-revalidate keyed on the storage path rather than
 * the signed URL. The URL changes every time the page asks for one (its token
 * expires in a minute, which is the whole point), so caching by full URL would
 * store a new copy of every document on every open. Keying on the path lets a
 * fresh URL for the same file serve the previously cached bytes when the
 * network cannot.
 */

const DOC_CACHE = "alyeska-documents-v1";

self.addEventListener("install", (event) => {
  // The worker takes over as soon as it is installed; there is no waiting
  // window where an old worker is still serving a browsing session that is
  // about to open a boarding pass.
  self.skipWaiting();
  event.waitUntil(caches.open(DOC_CACHE));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("alyeska-") && name !== DOC_CACHE)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

/**
 * Pull the object path out of a Supabase Storage signed URL. Both v1 and
 * "sign" style paths land the same way after the bucket segment.
 */
function storageKey(url) {
  try {
    const u = new URL(url);
    if (!u.pathname.includes("/storage/v1/object/")) return null;
    const marker = "/storage/v1/object/";
    const start = u.pathname.indexOf(marker);
    if (start < 0) return null;
    // Everything after /storage/v1/object/ identifies the file uniquely (bucket
    // + path), so it makes a stable cache key even when the token changes.
    const tail = u.pathname.slice(start + marker.length);
    // 'sign/documents/<family>/<scope>/<owner>/<file>' or
    // 'authenticated/documents/<...>' or
    // 'public/documents/<...>' -- normalize by dropping the first segment.
    const parts = tail.split("/");
    if (parts.length < 2) return null;
    return parts.slice(1).join("/");
  } catch {
    return null;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const key = storageKey(request.url);
  if (!key) return;

  // Do not intercept requests that are not for documents. The Supabase URL
  // shape is checked above; here we also make sure the bucket is 'documents'.
  if (!key.startsWith("documents/")) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(DOC_CACHE);
      const cacheKey = new Request(`https://alyeska.local/doc/${key}`);
      const cached = await cache.match(cacheKey);

      // Kick off the network fetch either way. The signed URL is single-use in
      // effect (short expiry), so the browser hits Supabase directly and any
      // 401 or 404 means the token has been refused for reasons that are not
      // the cache's problem.
      const networked = fetch(request)
        .then(async (response) => {
          if (response && response.ok) {
            try {
              await cache.put(cacheKey, response.clone());
            } catch {
              // Storage full or the response is opaque and not cachable.
              // Falling back to the network response is fine.
            }
          }
          return response;
        })
        .catch(() => null);

      if (cached) return cached;
      const fresh = await networked;
      if (fresh) return fresh;
      return new Response("Offline and not previously opened.", {
        status: 504,
        headers: { "content-type": "text/plain" },
      });
    })(),
  );
});
