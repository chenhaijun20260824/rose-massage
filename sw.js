// 玫瑰按摩 - Service Worker (PWA 离线支持)
const CACHE_NAME = 'rose-massage-v3';
const urlsToCache = [
  '/rose-massage/',
  '/rose-massage/index.html',
  '/rose-massage/login.html',
  '/rose-massage/register.html',
  '/rose-massage/profile.html',
  '/rose-massage/admin.html',
  '/rose-massage/admin-login.html'
];

self.addEventListener('install', function(e) {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(urlsToCache)));
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET' || !e.request.url.includes(self.location.origin)) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.status === 200) caches.open(CACHE_NAME).then(c => c.put(e.request, r.clone()));
    return r;
  }).catch(() => caches.match(e.request)));
});
