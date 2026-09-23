/* Proudley's Projects service worker: lets the site open without signal.
   Pages always try the network first, so a new index.html shows up straight away. */
const SHELL = "pp-shell-v1";
const MEDIA = "pp-media-v1";
const SHELL_FILES = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then(c => Promise.all(SHELL_FILES.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== MEDIA).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function trim(cache, max){
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // the page itself: network first, fall back to the saved copy offline
  if (req.mode === "navigate"){
    e.respondWith(fetch(req).then(res => {
      const copy = res.clone();
      caches.open(SHELL).then(c => c.put("./index.html", copy));
      return res;
    }).catch(() => caches.match("./index.html")));
    return;
  }

  // photos, map tiles and the map library: saved after first view
  const isMedia = url.pathname.includes("/storage/v1/object/public/")
    || url.hostname.endsWith("tile.openstreetmap.org")
    || url.hostname === "cdnjs.cloudflare.com";
  if (isMedia){
    e.respondWith(caches.open(MEDIA).then(async cache => {
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === "opaque"){ cache.put(req, res.clone()); trim(cache, 400); }
        return res;
      } catch (err) { return Response.error(); }
    }));
    return;
  }

  // everything else from this site (icons, manifest): cache first
  if (url.origin === self.location.origin){
    e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
  }
  // Supabase data and sign-in are never cached here: the app keeps its own offline copy.
});
