/* 家庭分享計時 — Service Worker
   所有靜態頁面、樣式、模組、自帶子集字型與圖示皆在首次開啟預先快取；
   100 組同時打開後各自完全離線運作，零伺服器請求、零互相干擾。 */
'use strict';

const CACHE_VERSION = 'family-timer-v6';
const OCR_CACHE = 'family-timer-ocr-v1';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './styles/fonts.css',
  './styles/tokens.css',
  './styles/setup.css',
  './styles/timer.css',
  './styles/seats.css',
  './styles/circle.css',
  './styles/panels.css',
  './styles/modals.css',
  './styles/profile.css',
  './styles/mobile.css',
  './js/main.js',
  './js/icons.js',
  './js/codec.js',
  './js/store.js',
  './js/audio.js',
  './js/timer-engine.js',
  './js/setup-view.js',
  './js/share-link.js',
  './js/seat-drag.js',
  './js/seat-profile.js',
  './js/seat-renderer.js',
  './js/circle-view.js',
  './js/timer-view.js',
  './js/drawer-view.js',
  './js/ocr.js',
  './fonts/inter-latin-var.woff2',
  './fonts/noto-sans-tc-subset.woff2',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => (k.startsWith('family-timer-') || k.startsWith('share-timer-')) && k !== CACHE_VERSION && k !== OCR_CACHE)
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname.includes('jsdelivr.net') || url.hostname.includes('projectnaptha.com')) {
    event.respondWith((async () => {
      const cache = await caches.open(OCR_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    })());
    return;
  }

  if (url.origin !== self.location.origin) return;

  const isNav = req.mode === 'navigate';
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    let cached = await cache.match(req, { ignoreSearch: true });
    if (!cached && isNav) {
      cached = (await cache.match('./index.html')) || (await cache.match('./'));
    }

    const netPromise = fetch(req)
      .then((res) => {
        if (res && res.ok && res.type === 'basic' && !res.redirected) {
          cache.put(req, res.clone()).catch(() => {});
        }
        return res;
      })
      .catch(() => null);

    if (cached) {
      event.waitUntil(netPromise);
      return cached;
    }
    const netRes = await netPromise;
    if (netRes) return netRes;
    return new Response('離線中，且此檔案尚未快取。', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  })());
});
