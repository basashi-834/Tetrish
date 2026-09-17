/**
 * オフライン用の素朴な Service Worker。
 * 静的アセットは初回にキャッシュし、以降はキャッシュ優先で返す。
 */
const VERSION = 'tetrish-v1';
const ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'js/main.js',
  'js/game.js',
  'js/pieces.js',
  'js/renderer.js',
  'js/effects.js',
  'js/audio.js',
  'js/input.js',
  'js/storage.js',
  'js/pachi.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => { /* 一部取得に失敗してもインストールは続行 */ })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith('http')) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
