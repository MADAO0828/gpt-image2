// This app no longer uses offline caching. Keep this file only to remove old registrations.
self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    self.registration.unregister().catch(function () {})
  );
});

self.addEventListener('fetch', function () {
  // Intentionally do nothing: all requests go through the browser/network.
});
