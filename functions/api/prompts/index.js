function json(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300'
    }
  });
}

function normalizePrompt(row) {
  return {
    id: row.id || 0,
    c: row.category || row.c || '',
    t: row.title || row.t || '',
    p: row.prompt || row.p || '',
    i: row.image_url || row.i || ''
  };
}

function filterRows(rows, cat, search) {
  var q = (search || '').toLowerCase();
  return rows.filter(function(row) {
    var p = normalizePrompt(row);
    if (cat && p.c !== cat) return false;
    if (q && (p.t.toLowerCase().indexOf(q) < 0 && p.p.toLowerCase().indexOf(q) < 0)) return false;
    return true;
  });
}

async function loadStaticPrompts(ctx) {
  var res = await ctx.env.ASSETS.fetch(new URL('/prompts_data.json', ctx.request.url));
  if (!res.ok) return [];
  var data = await res.json();
  return Array.isArray(data) ? data : [];
}

function categoryPayload(rows) {
  var seen = { all: true };
  var categories = ['all'];
  rows.forEach(function(row) {
    var cat = normalizePrompt(row).c;
    if (cat && !seen[cat]) {
      seen[cat] = true;
      categories.push(cat);
    }
  });
  return { categories: categories, total: rows.length };
}

export async function onRequest(ctx) {
  var url = new URL(ctx.request.url);
  var categoriesOnly = url.searchParams.get('categories') === '1';
  var page = Math.max(parseInt(url.searchParams.get('page')) || 1, 1);
  var limit = Math.min(Math.max(parseInt(url.searchParams.get('limit')) || 50, 1), 100);
  var cat = url.searchParams.get('cat') || '';
  var search = url.searchParams.get('q') || '';
  var offset = (page - 1) * limit;

  try {
    if (categoriesOnly) {
      var catRows = await ctx.env.gpt_image2_db
        .prepare('SELECT DISTINCT category FROM prompts WHERE category IS NOT NULL AND category != "" ORDER BY category ASC')
        .all();
      if ((catRows.results || []).length > 0) {
        return json(categoryPayload((catRows.results || []).map(function(row) {
          return { category: row.category };
        })));
      }
    }

    var query = 'SELECT id, category, title, prompt, image_url FROM prompts';
    var countQuery = 'SELECT COUNT(*) as total FROM prompts';
    var conditions = [];
    var params = [];

    if (cat) {
      conditions.push('category = ?');
      params.push(cat);
    }
    if (search) {
      conditions.push('(title LIKE ? OR prompt LIKE ?)');
      params.push('%' + search + '%');
      params.push('%' + search + '%');
    }
    if (conditions.length > 0) {
      var where = ' WHERE ' + conditions.join(' AND ');
      query += where;
      countQuery += where;
    }
    query += ' ORDER BY id ASC LIMIT ? OFFSET ?';

    var totalResult = await ctx.env.gpt_image2_db.prepare(countQuery).bind(...params).first();
    var total = totalResult ? totalResult.total || 0 : 0;
    if (total > 0) {
      var results = await ctx.env.gpt_image2_db.prepare(query).bind(...params, limit, offset).all();
      return json({
        prompts: (results.results || []).map(normalizePrompt),
        total: total,
        page: page,
        limit: limit,
        pages: Math.ceil(total / limit),
        source: 'd1'
      });
    }
  } catch (e) {}

  try {
    var staticRows = await loadStaticPrompts(ctx);
    if (categoriesOnly) return json(categoryPayload(staticRows));

    var all = filterRows(staticRows, cat, search);
    var chunk = all.slice(offset, offset + limit).map(function(row, idx) {
      var p = normalizePrompt(row);
      p.id = p.id || offset + idx + 1;
      return p;
    });
    return json({
      prompts: chunk,
      total: all.length,
      page: page,
      limit: limit,
      pages: Math.ceil(all.length / limit),
      source: 'static'
    });
  } catch (e) {
    return json({ prompts: [], total: 0, page: 1, limit: limit, pages: 0, error: e.message });
  }
}
