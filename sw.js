/* PDTIII 看板 Service Worker — 离线壳: 缓存页面自身, 数据仍走 Firebase 实时网络 */
var CACHE = 'pdtiii-shell-v1';
var CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var url = e.request.url;
  // 数据请求永不缓存(走网络), 页面与静态资源网络优先, 失败回退缓存
  if (url.indexOf('firebaseio.com') >= 0 || url.indexOf('firebase.google.com') >= 0) return;
  e.respondWith(
    fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return res;
    }).catch(function () { return caches.match(e.request).then(function (hit) { return hit || caches.match('./index.html'); }); })
  );
});
