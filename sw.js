// Service Worker 已完全禁用
// 所有请求直接通过浏览器，不进行任何缓存拦截
self.addEventListener('install', function() {
  self.skipWaiting();
});
self.addEventListener('activate', function() {
  self.clients.claim();
});
// 所有 fetch 直接透传，不做任何缓存
self.addEventListener('fetch', function() {
  return;
});
