// Simple SW for offline cache (static only)
const CACHE = "btx-offline-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event)=>{
  event.waitUntil((async ()=>{
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event)=>{
  event.waitUntil((async ()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (event)=>{
  const req = event.request;
  // cache-first for same-origin GET
  if(req.method === "GET" && new URL(req.url).origin === self.location.origin){
    event.respondWith((async ()=>{
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req, {ignoreSearch:true});
      if(cached) return cached;
      const fresh = await fetch(req);
      // best effort cache
      try{ cache.put(req, fresh.clone()); }catch(e){}
      return fresh;
    })());
  }
});
