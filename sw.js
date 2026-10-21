/* CHIIK service worker: guarda la app y los datos para uso sin conexión.
   La versión se sustituye al construir; un cambio de versión instala una caché nueva
   completa antes de activarla, y la anterior sigue funcionando si la descarga falla. */
const VERSION = "202610211232";
const CACHE = "chiik-" + VERSION;
const CORE = ["./", "index.html", "data.js", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "icon-maskable-512.png"];

self.addEventListener("install", e => {
  // La versión nueva se descarga completa y se activa de inmediato.
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("message", e => { if (e.data === "skip") self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("chiik-") && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Tipografías de Google: se guardan la primera vez que se usan.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.open(CACHE + "-fonts").then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      try { const r = await fetch(req); if (r.ok || r.type === "opaque") c.put(req, r.clone()); return r; }
      catch (err) { return new Response("", { status: 504 }); }
    }));
    return;
  }
  if (url.origin !== location.origin) return; // PDFs de fabricantes: siempre en línea
  const fresh = req.mode === "navigate" || /\/(index\.html|data\.js)?$/.test(url.pathname) || url.pathname.endsWith("data.js") || url.pathname.endsWith("index.html");
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    if (fresh) {
      // Con internet: la versión más reciente (máx. 4 s). Sin internet: la copia guardada.
      try {
        const r = await Promise.race([fetch(req, { cache: "no-cache" }), new Promise((_, rej) => setTimeout(() => rej(new Error("lento")), 4000))]);
        if (r && r.ok) { c.put(req.mode === "navigate" ? "index.html" : req, r.clone()); return r; }
      } catch (err) {}
      return (await c.match(req, { ignoreSearch: true })) || (await c.match("index.html")) || new Response("Sin conexión", { status: 503 });
    }
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try { return await fetch(req); }
    catch (err) { return new Response("", { status: 504 }); }
  })());
});
