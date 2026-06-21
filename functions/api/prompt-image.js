const ALLOWED_PREFIX = 'https://cdn.leaderai.top/oss/moban-image/image_prompt/imgs_src/';

function error(message, status = 400) {
  return new Response(message, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

export async function onRequestGet(ctx) {
  const url = new URL(ctx.request.url);
  const raw = url.searchParams.get('u') || '';
  let target;
  try {
    target = new URL(raw);
  } catch (e) {
    return error('invalid image url');
  }
  const targetUrl = target.toString();
  if (!targetUrl.startsWith(ALLOWED_PREFIX)) return error('image host is not allowed', 403);

  const upstream = await fetch(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome Safari',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Referer': 'https://www.leaderai.top/'
    },
    cf: {
      cacheEverything: true,
      cacheTtl: 86400
    }
  });
  if (!upstream.ok) return error('upstream image fetch failed: ' + upstream.status, upstream.status);

  const headers = new Headers(upstream.headers);
  headers.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  headers.set('Access-Control-Allow-Origin', '*');
  headers.delete('Set-Cookie');
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers
  });
}
