
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=300' } });
}
function normalizePrompt(row) { return { id: row.id || 0, c: row.category || row.c || '', t: row.title || row.t || '', p: row.prompt || row.p || '', i: row.image_url || row.i || '' }; }
function filterRows(rows, cat, search) { const q = String(search || '').toLowerCase(); return rows.filter(row => { const p = normalizePrompt(row); if (cat && cat !== 'all' && p.c !== cat) return false; if (q && p.t.toLowerCase().indexOf(q) < 0 && p.p.toLowerCase().indexOf(q) < 0) return false; return true; }); }
async function loadStaticPrompts(ctx) { const res = await ctx.env.ASSETS.fetch(new URL('/prompts_data.json', ctx.request.url)); if (!res.ok) return []; const data = await res.json(); return Array.isArray(data) ? data : []; }
function categoryPayload(rows) { const seen = { all: true }; const categories = ['all']; rows.forEach(row => { const cat = normalizePrompt(row).c; if (cat && !seen[cat]) { seen[cat] = true; categories.push(cat); } }); return { categories, total: rows.length }; }

export async function onRequest(ctx) {
  const url = new URL(ctx.request.url);
  const categoriesOnly = url.searchParams.get('categories') === '1';
  const source = (url.searchParams.get('source') || 'static').toLowerCase();
  const page = Math.max(parseInt(url.searchParams.get('page')) || 1, 1);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit')) || 50, 1), 100);
  const cat = url.searchParams.get('cat') || '';
  const search = url.searchParams.get('q') || '';
  const offset = (page - 1) * limit;

  // LeaderAI 仓库更新后，线上接口必须优先读取随部署发布的 prompts_data.json。
  // 旧版本曾优先读取 D1 prompts 表，导致即使静态文件已更新，页面仍显示旧仓库。
  // 只有显式 ?source=d1 时才读 D1，避免历史数据覆盖最新版静态仓库。
  if (source !== 'd1') {
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
