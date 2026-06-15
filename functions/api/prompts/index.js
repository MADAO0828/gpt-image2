export async function onRequest(ctx) {
  var url = new URL(ctx.request.url);
  var page = parseInt(url.searchParams.get('page')) || 1;
  var limit = parseInt(url.searchParams.get('limit')) || 50;
  var cat = url.searchParams.get('cat') || '';
  var search = url.searchParams.get('q') || '';
  
  var offset = (page - 1) * limit;
  
  // Try to read from prompts table
  try {
    var query = "SELECT id, category, title, prompt, image_url FROM prompts";
    var countQuery = "SELECT COUNT(*) as total FROM prompts";
    var conditions = [];
    var params = [];
    
    if (cat) {
      conditions.push("category = ?");
      params.push(cat);
    }
    if (search) {
      conditions.push("(title LIKE ? OR prompt LIKE ?)");
      params.push('%' + search + '%');
      params.push('%' + search + '%');
    }
    
    if (conditions.length > 0) {
      var where = " WHERE " + conditions.join(" AND ");
      query += where + " ORDER BY id ASC LIMIT ? OFFSET ?";
      countQuery += where;
    } else {
      query += " ORDER BY id ASC LIMIT ? OFFSET ?";
    }
    
    var totalResult = await ctx.env.gpt_image2_db.prepare(countQuery).bind(...params).first();
    var total = totalResult ? totalResult.total || 0 : 0;
    
    var results = await ctx.env.gpt_image2_db.prepare(query).bind(...params, limit, offset).all();
    
    return new Response(JSON.stringify({
      prompts: results.results || [],
      total: total,
      page: page,
      limit: limit,
      pages: Math.ceil(total / limit)
    }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
    });
  } catch (e) {
    // Table doesn't exist yet - return empty
    return new Response(JSON.stringify({ prompts: [], total: 0, page: 1, limit: limit, pages: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
