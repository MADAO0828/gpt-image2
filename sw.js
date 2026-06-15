// Service Worker disabled - was causing mobile caching/browser issues
// Keeping file to prevent 404s but all requests pass through
self.addEventListener('fetch', (event) => {
  return; // pass through - no caching
});
