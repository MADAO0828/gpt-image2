export async function onRequestGet(ctx) {
  const url = new URL(ctx.request.url);
  const baseUrl = url.searchParams.get('baseUrl') || '';
  const apiKey = url.searchParams.get('apiKey') || '';

  if (!baseUrl || !apiKey) {
    return new Response(JSON.stringify({ error: 'Missing baseUrl or apiKey' }), {
      status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
  }

  try {
    const apiUrl = baseUrl.replace(/\/+$/, '') + '/models';
    const res = await fetch(apiUrl, {
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' }
    });
    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'API error: ' + res.status }), {
        status: 502, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      });
    }
    const data = await res.json();
    const models = (data.data || []).map((m) => ({ id: m.id, ownedBy: m.owned_by || '' }));
    return new Response(JSON.stringify({ models, source: 'openai' }), {
      status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
  }
}