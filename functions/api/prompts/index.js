
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=300' } });
}
let staticPromptsCache = null;
let staticPromptsCacheAt = 0;
let staticCategoryCache = null;
let promptBootstrapCache = null;
let promptBootstrapCacheAt = 0;
let promptSearchCache = null;
let promptSearchCacheAt = 0;
const STATIC_PROMPTS_TTL = 5 * 60 * 1000;
function firstPromptImage(row) {
  const images = Array.isArray(row && row.images) ? row.images : [];
  for (const image of images) {
    if (!image) continue;
    const url = image.url || image.image_url || image.imageUrl || image.src || image.href;
    if (url) return url;
  }
  return '';
}
function normalizePrompt(row) {
  row = row || {};
  return {
    id: row.id || 0,
    c: row.category || row.c || '',
    t: row.title || row.t || '',
    p: row.prompt || row.p || row.description || '',
    i: row.image_url || row.imageUrl || row.i || firstPromptImage(row) || ''
  };
}
function filterRows(rows, cat, search) { const q = String(search || '').toLowerCase(); return rows.filter(row => { const p = normalizePrompt(row); if (cat && cat !== 'all' && p.c !== cat) return false; if (q && p.t.toLowerCase().indexOf(q) < 0 && p.p.toLowerCase().indexOf(q) < 0) return false; return true; }); }
async function loadStaticPrompts(ctx) { const now = Date.now(); if (staticPromptsCache && (now - staticPromptsCacheAt) < STATIC_PROMPTS_TTL) return staticPromptsCache; const res = await ctx.env.ASSETS.fetch(new URL('/prompts_data.json', ctx.request.url)); if (!res.ok) return []; const data = await res.json(); staticPromptsCache = Array.isArray(data) ? data : []; staticPromptsCacheAt = now; staticCategoryCache = null; return staticPromptsCache; }
function categoryPayload(rows) { if (rows === staticPromptsCache && staticCategoryCache) return staticCategoryCache; const seen = { all: true }; const categories = ['all']; rows.forEach(row => { const cat = normalizePrompt(row).c; if (cat && !seen[cat]) { seen[cat] = true; categories.push(cat); } }); const payload = { categories, total: rows.length }; if (rows === staticPromptsCache) staticCategoryCache = payload; return payload; }
async function loadPromptBootstrap(ctx) {
  const now = Date.now();
  if (promptBootstrapCache && (now - promptBootstrapCacheAt) < STATIC_PROMPTS_TTL) return promptBootstrapCache;
  const res = await ctx.env.ASSETS.fetch(new URL('/prompts_fast/bootstrap.json', ctx.request.url));
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || !Array.isArray(data.categories)) return null;
  promptBootstrapCache = data;
  promptBootstrapCacheAt = now;
  return promptBootstrapCache;
}
async function loadPromptFastCategory(ctx, bootstrap, cat) {
  const file = bootstrap?.categoryFiles?.[cat];
  if (!file || String(file).includes('..')) return null;
  const res = await ctx.env.ASSETS.fetch(new URL(`/prompts_fast/${file}`, ctx.request.url));
  if (!res.ok) return null;
  return res.json();
}
async function loadPromptSearchIndex(ctx) {
  const now = Date.now();
  if (promptSearchCache && (now - promptSearchCacheAt) < STATIC_PROMPTS_TTL) return promptSearchCache;
  const res = await ctx.env.ASSETS.fetch(new URL('/prompts_fast/search_index.json', ctx.request.url));
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || !Array.isArray(data.prompts)) return null;
  promptSearchCache = data;
  promptSearchCacheAt = now;
  return promptSearchCache;
}
function normalizeSearchText(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}
function fastSearchPayload(searchIndex, cat, search, page, limit) {
  const tokens = normalizeSearchText(search).split(' ').filter(Boolean);
  if (!searchIndex || !tokens.length) return null;
  const cleanCat = cat || 'all';
  const ranked = [];
  (searchIndex.prompts || []).forEach((item, index) => {
    if (cleanCat !== 'all' && item.c !== cleanCat) return;
    const haystack = normalizeSearchText(`${item.q || ''} ${item.p || ''}`);
    if (!tokens.every((token) => haystack.includes(token))) return;
    const title = normalizeSearchText(item.t || '');
    let score = 0;
    tokens.forEach((token) => {
      if (title.includes(token)) score += 8;
      if (haystack.startsWith(token)) score += 2;
    });
    ranked.push({ item, index, score });
  });
  ranked.sort((a, b) => b.score - a.score || a.index - b.index);
  const offset = (page - 1) * limit;
  return {
    prompts: ranked.slice(offset, offset + limit).map((entry) => ({
      ...entry.item,
      partial: Boolean(entry.item.partial || entry.item.d || /\.\.\.$|…$/.test(String(entry.item.p || '').trim()))
    })),
    total: ranked.length,
    page,
    limit,
    pages: Math.ceil(ranked.length / limit),
    source: 'prebuilt-search-index'
  };
}
async function fastPageFromBootstrap(ctx, bootstrap, cat, limit) {
  if (!bootstrap || limit > (bootstrap.pageSize || 36)) return null;
  const source = cat && cat !== 'all' ? await loadPromptFastCategory(ctx, bootstrap, cat) : bootstrap.allFirstPage;
  if (!source || !Array.isArray(source.prompts)) return null;
  return {
    prompts: source.prompts.slice(0, limit),
    total: source.total || 0,
    page: 1,
    limit,
    pages: Math.ceil((source.total || 0) / limit),
    source: source.source || 'prebuilt-bootstrap'
  };
}

export async function onRequest(ctx) {
  const url = new URL(ctx.request.url);
  const categoriesOnly = url.searchParams.get('categories') === '1';
  const source = (url.searchParams.get('source') || 'static').toLowerCase();
  const page = Math.max(parseInt(url.searchParams.get('page')) || 1, 1);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit')) || 50, 1), 100);
  const cat = url.searchParams.get('cat') || '';
  const search = url.searchParams.get('q') || '';
  const offset = (page - 1) * limit;

  // The prompt repository is deployed with prompts_data.json as the source of truth.
  // D1 is only used when explicitly requested with ?source=d1, so archived rows cannot
  // override the current bundled repository.
  if (source !== 'd1') {
    try {
      const bootstrap = await loadPromptBootstrap(ctx);
      if (bootstrap && !search && page === 1) {
        if (categoriesOnly) return json({ categories: bootstrap.categories || ['all'], total: bootstrap.total || 0, source: 'prebuilt-bootstrap' });
        const fastPage = await fastPageFromBootstrap(ctx, bootstrap, cat, limit);
        if (fastPage) return json(fastPage);
      }
      if (search && !categoriesOnly) {
        const searchIndex = await loadPromptSearchIndex(ctx);
        const fastSearch = fastSearchPayload(searchIndex, cat, search, page, limit);
        if (fastSearch) return json(fastSearch);
      }
    } catch (e) {
      // Prebuilt fast cache unavailable: fall through to the source JSON path.
    }
    try {
      const staticRows = await loadStaticPrompts(ctx);
      if (staticRows.length > 0) {
        if (categoriesOnly) return json({ ...categoryPayload(staticRows), source: 'static' });
        const all = filterRows(staticRows, cat, search);
        const chunk = all.slice(offset, offset + limit).map((row, idx) => { const p = normalizePrompt(row); p.id = p.id || offset + idx + 1; return p; });
        return json({ prompts: chunk, total: all.length, page, limit, pages: Math.ceil(all.length / limit), source: 'static' });
      }
    } catch (e) {
      // Static asset unavailable: fall through to D1 as a recovery path.
    }
  }

  try {
    if (categoriesOnly) {
      const catRows = await ctx.env.gpt_image2_db.prepare('SELECT DISTINCT category FROM prompts WHERE category IS NOT NULL AND category != "" ORDER BY category ASC').all();
      if ((catRows.results || []).length > 0) return json({ ...categoryPayload((catRows.results || []).map(row => ({ category: row.category }))), source: 'd1' });
    }
    let query = 'SELECT id, category, title, prompt, image_url FROM prompts';
    let countQuery = 'SELECT COUNT(*) as total FROM prompts';
    const conditions = [];
    const params = [];
    if (cat && cat !== 'all') { conditions.push('category = ?'); params.push(cat); }
    if (search) { conditions.push('(title LIKE ? OR prompt LIKE ?)'); params.push('%' + search + '%', '%' + search + '%'); }
    if (conditions.length) { const where = ' WHERE ' + conditions.join(' AND '); query += where; countQuery += where; }
    query += ' ORDER BY id ASC LIMIT ? OFFSET ?';
    const totalResult = await ctx.env.gpt_image2_db.prepare(countQuery).bind(...params).first();
    const total = totalResult ? totalResult.total || 0 : 0;
    if (total > 0) {
      const results = await ctx.env.gpt_image2_db.prepare(query).bind(...params, limit, offset).all();
      return json({ prompts: (results.results || []).map(normalizePrompt), total, page, limit, pages: Math.ceil(total / limit), source: 'd1' });
    }
  } catch (e) {}
  return json({ prompts: [], total: 0, page: 1, limit, pages: 0, source: source === 'd1' ? 'd1' : 'static', error: 'prompt repository is empty' }, 500);
}
