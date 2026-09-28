// Veylune offline shell. The app keeps all project data in IndexedDB, so the
// only thing that can fail offline is loading the app itself. Strategy:
//   - Navigations: network-first, fall back to the cached shell so /studio/*
//     routes (History API paths) still render with no connection.
//   - /assets/* (content-hashed by the bundler) and WASM: cache-first — the
//     URL changes whenever the bytes do, so a stale entry is impossible.
//   - Fixed-name public files (icons, manifest): stale-while-revalidate.
//   - Anything else (cross-origin, POSTs): passthrough, never cached.
// main.ts registers this file as /sw.js?v=<build id>. A changed URL installs
// a fresh worker, and the per-build cache name below makes activate() drop
// the old build's cache — no user can be stuck on a stale offline shell.
const BUILD = new URL(self.location).searchParams.get("v") ?? "dev";
const CACHE = `veylune-${BUILD}`;
const SHELL = ["/", "/index.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL).catch(() => undefined)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put("/index.html", copy));
          return response;
        })
        .catch(async () => (await caches.match("/index.html")) ?? Response.error()),
    );
    return;
  }

  if (url.pathname.startsWith("/assets/") || url.pathname.endsWith(".wasm")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Fixed-name static files: answer from cache, refresh in the background.
  if (/\.(?:svg|png|ico|webmanifest|css|txt|xml)$/.test(url.pathname)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response.ok) void cache.put(request, response.clone());
            return response;
          })
          .catch(() => undefined);
        return cached ?? (await network) ?? Response.error();
      }),
    );
  }
});
