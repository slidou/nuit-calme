/* ═══════════════════════════════════════════════════════════════
   NUIT CALME — service worker (V2.27)
   L'app installée démarre sans réseau : la coquille (page, styles,
   scripts, bibliothèques epub.js / pdf.js, polices, icônes) vit dans
   le cache ; les livres, eux, reposent dans IndexedDB — la liseuse
   entière s'ouvre et se lit hors-ligne.
   Stratégies :
   · navigations → réseau d'abord (les mises à jour arrivent d'une
     simple recharge), cache en secours si le réseau manque ;
   · le reste → servi du cache puis rafraîchi en arrière-plan ;
   · ce qui vient d'ailleurs (packs, livres distants) → le réseau
     décide, les importations finissent de toute façon en IndexedDB.
   ═══════════════════════════════════════════════════════════════ */
'use strict';

const CACHE = 'nuit-calme-v2.27';

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

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      /* cache:'reload' (V2.26) : le pré-cache va toujours chercher le
         réseau, jamais le cache HTTP du navigateur — une copie périmée
         ne peut plus s'installer (la mise à jour tenait parfois en
         deux ou trois recharges au lieu d'une seule). */
      .then((cache) => cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Packs de livres et autres ressources distantes : le réseau décide.
  if (url.origin !== self.location.origin) return;

  // Navigation (la page elle-même) : réseau d'abord, cache en secours.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put('./index.html', copy));
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Statique de l'app : cache d'abord, rafraîchi en arrière-plan.
  event.respondWith(
    caches.match(req).then((cached) => {
      const refresh = fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || refresh;
    })
  );
});
