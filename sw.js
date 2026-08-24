// 玫瑰按摩 - Service Worker (PWA 离线支持) v4
const CACHE_NAME = 'rose-massage-v4';
const urlsToCache = [
  '/rose-massage/',
  '/rose-massage/index.html',
  '/rose-massage/login.html',
  '/rose-massage/register_v2.html',
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
  var u = new URL(e.request.url);
  if (u.pathname.endsWith('.html')) {
    // HTML 永远走网络，确保拿到最新代码，绝不使用缓存的旧版页面
    e.respondWith(fetch(e.request).catch(function() { return caches.match(e.request); }));
    return;
  }
  e.respondWith(fetch(e.request).then(function(r) {
    if (r.status === 200) caches.open(CACHE_NAME).then(c => c.put(e.request, r.clone()));
    return r;
  }).catch(function() { return caches.match(e.request); }));
});