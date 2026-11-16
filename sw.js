/* ═══════════════════════════════════════════════════════════════
   NUIT CALME — service worker
   L'app installée démarre sans réseau : la coquille (page, styles,
   scripts, bibliothèques epub.js / pdf.js, polices, icônes) vit dans
   le cache ; les livres, eux, reposent dans IndexedDB — la liseuse
   entière s'ouvre et se lit hors-ligne.
   Stratégies :
   · navigations → page et ressources du même pré-cache ;
   · ressources de l'interface → pré-cache de la version active ;
   · packs, livres et autres ressources → le réseau
     décide, les importations finissent de toute façon en IndexedDB.
   ═══════════════════════════════════════════════════════════════ */
'use strict';

const SCOPE = self.registration.scope;
const CACHE_PREFIX = `nuit-calme:${SCOPE}:`;
const CACHE = CACHE_PREFIX + 'v2.27-4';

const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/util.js',
  'js/idb.js',
  'js/library.js',
  'js/goal.js',
  'js/backup.js',
  'js/packs.js',
  'js/epub-reader.js',
  'js/pdf-reader.js',
  'js/touch.js',
  'js/reader.js',
  'js/app.js',
  'vendor/jszip.min.js',
  'vendor/epub.min.js',
  'vendor/pdf.min.js',
  'vendor/pdf.worker.min.js',
  'vendor/html2canvas.min.js',
  // Polices embarquées (Cormorant Garamond & Inter)
  'vendor/fonts/cormorant-garamond-latin-500-normal.woff2',
  'vendor/fonts/cormorant-garamond-latin-600-normal.woff2',
  'vendor/fonts/cormorant-garamond-latin-700-normal.woff2',
  'vendor/fonts/cormorant-garamond-latin-500-italic.woff2',
  'vendor/fonts/cormorant-garamond-latin-ext-500-normal.woff2',
  'vendor/fonts/cormorant-garamond-latin-ext-600-normal.woff2',
  'vendor/fonts/cormorant-garamond-latin-ext-700-normal.woff2',
  'vendor/fonts/cormorant-garamond-latin-ext-500-italic.woff2',
  'vendor/fonts/inter-latin-400-normal.woff2',
  'vendor/fonts/inter-latin-500-normal.woff2',
  'vendor/fonts/inter-latin-600-normal.woff2',
  'vendor/fonts/inter-latin-ext-400-normal.woff2',
  'vendor/fonts/inter-latin-ext-500-normal.woff2',
  'vendor/fonts/inter-latin-ext-600-normal.woff2',
  // Icônes de l'app
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-192.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];
const STATIC_URLS = new Set(PRECACHE.slice(2).map((path) => new URL(path, SCOPE).href));
const ENTRY = new URL('index.html', SCOPE).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      /* cache:'reload' (V2.26) : le pré-cache va toujours chercher le
         réseau, jamais le cache HTTP du navigateur — une copie périmée
         ne peut plus s'installer (la mise à jour tenait parfois en
         deux ou trois recharges au lieu d'une seule). */
      .then((cache) => cache.addAll(PRECACHE.map((u) => new Request(new URL(u, SCOPE), { cache: 'reload' }))))
  );
});

// Une nouvelle version attend que les pages de l’ancienne soient fermées.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (req.mode === 'navigate') {
    url.search = '';
    if (url.href === SCOPE || url.href === ENTRY) {
      event.respondWith((async () => {
        const cache = await caches.open(CACHE);
        return await cache.match(ENTRY) || fetch(req);
      })());
    }
    return;
  }

  if (!STATIC_URLS.has(url.href) || req.headers.has('Range')) return;
  event.respondWith(caches.open(CACHE).then(async (cache) =>
    await cache.match(req) || fetch(req)));
});
