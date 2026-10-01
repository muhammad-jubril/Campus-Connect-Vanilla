// Bump this on every deploy. It's the ONLY signal that tells a browser "a
// new version exists" — the browser compares this file byte-for-byte, so if
// this string doesn't change, anyone who already has the app open or
// installed keeps using the exact same worker and cache forever, no matter
// what actually changed in index.html/css/js.
const CACHE_NAME = "campus-connect-v18";
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/css/base.css",
  "/css/app-shell.css",
  "/css/forms.css",
  "/css/loading.css",
  "/css/feed.css",
  "/css/profile-composer.css",
  "/css/screens.css",
  "/js/data-faculties.js",
  "/js/ui-helpers.js",
  "/js/auth.js",
  "/js/data.js",
  "/js/feed.js",
  "/js/notifications.js",
  "/js/profile.js",
  "/js/create-post.js",
  "/js/app-shell.js",
  "/supabase-config.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first, falling back to cache only when the network request fails
// (i.e. actually offline). This always shows the latest deployed version
// when there's a connection, and only serves the cached copy as a true
// offline fallback — trading a little caching efficiency for never silently
// showing someone a stale version of the app, which matters far more here
// than shaving milliseconds off a load.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
