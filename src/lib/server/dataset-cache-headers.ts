/**
 * Cache policy for dataset API responses.
 *
 * Every dataset request the app makes carries a `datasetHash` cache-buster
 * (the version's content checksum), so a URL can never mean different bytes
 * and the response is safe to cache indefinitely, in the browser and at a CDN.
 * A request without it (a hand-made API call) gets no-store.
 */
export function datasetCacheHeaders(request: Request): Record<string, string> {
  // In dev the server code behind these responses changes constantly, and an
  // immutable cache would keep serving stale output. Production only.
  if (process.env.NODE_ENV !== "production") {
    return { "Cache-Control": "no-store" };
  }
  const fingerprinted = new URL(request.url).searchParams.has("datasetHash");
  return {
    "Cache-Control": fingerprinted ? "public, max-age=31536000, immutable" : "no-store",
  };
}
