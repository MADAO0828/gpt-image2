export function onRequest() {
  return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', 'Content-Type': 'text/plain; charset=utf-8' } });
}
