/**
 * AutoValuate service worker.
 *
 * The point of this SW is the on-device damage scanner: the ONNX model (44 MB) and the
 * onnxruntime-web wasm binaries are immutable, so we cache-first them permanently. Once a
 * user has scanned a car, the detector keeps working with no network at all — which is the
 * whole promise of running CV in the browser.
 *
 * Everything else is network-first with a cache fallback, so the app opens offline but
 * never serves a stale valuation UI when the network is available.
 */
const VERSION = "av-v1";
const SHELL = `${VERSION}-shell`;
const HEAVY = `${VERSION}-heavy`; // model + wasm: immutable, cached forever

// Cache-first for the big immutable ML assets.
const isHeavy = (url) =>
  url.pathname.startsWith("/models/") || url.pathname.startsWith("/ort/");

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(["/"]).catch(() => {})));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never touch the API or Supabase

  // 1) Model + wasm runtime: cache-first, forever. Makes the scanner work offline.
  if (isHeavy(url)) {
    event.respondWith(
      caches.open(HEAVY).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  // 2) Everything else: network-first, fall back to cache when offline.
  event.respondWith(
    (async () => {
      try {
        const res = await fetch(request);
        if (res.ok && request.mode === "navigate") {
          const cache = await caches.open(SHELL);
          cache.put(request, res.clone());
        }
        return res;
      } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") {
          const shell = await caches.match("/");
          if (shell) return shell;
        }
        throw new Error("offline and not cached");
      }
    })(),
  );
});
