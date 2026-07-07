const JWT_FALLBACK = 'gpt-image2-jwt-secret-key-2026-secure';
function secret(env) {
  if (env && env.JWT_SECRET) return env.JWT_SECRET;
  if (env && env.ALLOW_INSECURE_JWT_FALLBACK === 'true') return JWT_FALLBACK;
  return null;
}
function isLocalJwtRequest(request) {
  try {
    const hostname = new URL(request && request.url || 'http://invalid').hostname;
    return hostname === '127.0.0.1' || hostname === 'localhost';
  } catch {
    return false;
  }
}
function resolveSecret(env, request) {
  const value = secret(env);
  if (value) return value;
  if (isLocalJwtRequest(request)) return JWT_FALLBACK;
  throw new Error('JWT_SECRET is required');
}
function b64urlDecode(str) { str = String(str || '').replace(/-/g, '+').replace(/_/g, '/'); while (str.length % 4) str += '='; return Uint8Array.from(atob(str), c => c.charCodeAt(0)); }
function getCookie(header, name) { const m = (header || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : null; }
async function importHmacKey(value) { return crypto.subtle.importKey('raw', new TextEncoder().encode(value), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']); }
async function verifyToken(token, env, request) { const parts = String(token || '').split('.'); if (parts.length !== 3) throw new Error('invalid token'); const key = await importHmacKey(resolveSecret(env, request)); const ok = await crypto.subtle.verify('HMAC', key, b64urlDecode(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1])); if (!ok) throw new Error('bad signature'); const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1]))); if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw new Error('expired'); return payload; }
function getRequestToken(request) { return getCookie(request.headers.get('Cookie') || '', 'session') || String(request.headers.get('X-GPT-Image-Session') || '').trim() || null; }
async function currentUser(request, env) { const token = getRequestToken(request); if (!token) return null; try { const payload = await verifyToken(token, env, request); return await env.gpt_image2_db.prepare('SELECT id, username, role FROM users WHERE id = ?').bind(payload.userId).first(); } catch { return null; } }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } }); }
async function loadSettings(db, userId) { const rows = await db.prepare('SELECT key, value FROM user_settings WHERE user_id = ?').bind(userId).all(); const settings = {}; (rows.results || []).forEach(row => { try { settings[row.key] = JSON.parse(row.value); } catch { settings[row.key] = row.value; } }); return settings; }
function firstString() { for (let i = 0; i < arguments.length; i++) { const v = arguments[i]; if (typeof v === 'string' && v.trim()) return v.trim(); } return ''; }
function asNum(value, fallback) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function normalizeBaseUrl(raw) { let value = String(raw || '').trim().replace(/\/+$/, ''); if (!value) return ''; if (!/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(value)) value = 'https://' + value; try { const url = new URL(value); const parts = url.pathname.split('/').filter(Boolean); if (!parts.includes('v1')) parts.push('v1'); url.pathname = '/' + parts.join('/'); url.search = ''; url.hash = ''; return url.toString().replace(/\/+$/, ''); } catch { return value.replace(/\/+$/, '') + '/v1'; } }
function selectedProfile(settings) { const profiles = Array.isArray(settings.profiles) ? settings.profiles : []; const preferredId = settings.agentTextProfileId || settings.activeProfileId || (profiles[0] && profiles[0].id) || 'default-openai'; const textProfile = profiles.find(p => p && p.id === preferredId && p.apiMode === 'responses'); const base = textProfile || profiles.find(p => p && p.apiMode === 'responses') || profiles.find(p => p && p.id === preferredId) || profiles[0] || {}; return { id: base.id || preferredId, name: base.name || '云端配置', provider: base.provider || 'openai', baseUrl: firstString(base.baseUrl, settings.baseUrl), apiKey: firstString(base.apiKey, settings.apiKey), model: firstString(base.model, settings.model) || 'gpt-5-mini', timeout: asNum(base.timeout, asNum(settings.timeout, 600)) }; }
function parseJson(value, fallback) { try { return JSON.parse(String(value || '')); } catch { return fallback; } }
function fallbackAnalysis(body) {
  const mode = body.mode === 'styleTransfer' ? '灵感迁移' : body.mode === 'manual' ? '手动模式' : 'AI 模式';
  const prompt = String(body.prompt || '').trim();
  const dimensions = [
    ['time', '时间'], ['weather', '天气'], ['lighting', '灯光'], ['style', '项目风格'], ['camera', '设备镜头'],
    ['environment', '配景环境'], ['foreground', '人物前景'], ['rendering', '画面表现'], ['colorGrading', '后期调色'], ['atmosphere', '画面氛围']
  ].map(([key, label]) => ({ key, label, enabled: !body.selectedDimensions || body.selectedDimensions[key] !== false }));
  return {
    review: '未完成视觉读图，已根据输入参数生成保守建议。',
    intent: mode === '灵感迁移' ? '迁移参考图的光影、色彩、材质和氛围。' : '基于底图进行专业建筑表现优化。',
    strategy: '强保结构，优先调整时间、天气、灯光、材质、配景和成片质感。',
    scene: mode === '灵感迁移' ? '参考风格迁移' : '建筑/空间渲染',
    material: '真实材质、细节清晰',
    lighting: '自然柔光、电影级光影',
    camera: '广角写实、透视稳定',
    style: mode === '灵感迁移' ? '保留底图结构并迁移参考图氛围' : '商业级写实渲染',
    negative: '避免畸变、过曝、低清晰度、错误透视',
    dimensions,
    structureLock: '保留建筑轮廓、透视、体块、开窗位置和主要构图。',
    recommendedPrompt: [prompt, mode, '高质量、写实、材质真实、光影自然、空间透视准确，强保原图结构'].filter(Boolean).join('，')
  };
}
function jsonFromModelText(text, fallback) {
  const raw = String(text || '').trim();
  try { return JSON.parse(raw); } catch {}
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) { try { return JSON.parse(fenced[1]); } catch {} }
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch {} }
  return fallback;
}
async function fileToDataUrl(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${file.type || 'image/png'};base64,${btoa(binary)}`;
}
function contentText(body, fileCount) {
  return [
    '你是专业空间/建筑渲染工作台的视觉分析器。请根据上传图片真实内容审片，并只返回 JSON，不要 Markdown。',
    `模式：${body.mode === 'styleTransfer' ? '灵感迁移' : body.mode === 'manual' ? '手动模式' : 'AI 模式'}`,
    `用户要求：${body.prompt || '无'}`,
    `上传图片数量：${fileCount}`,
    `结构化参数：${JSON.stringify(body.params || {})}`,
    `迁移维度：${JSON.stringify(body.selectedDimensions || {})}`,
    '必须具体描述底图里可见的空间类型、建筑体块、透视、材质、光照、环境和需要保留的结构。',
    '必须强保原图建筑结构、透视、体块、开窗位置和主要构图。',
    'JSON 字段：review, intent, strategy, scene, material, lighting, camera, style, negative, dimensions, structureLock, recommendedPrompt。dimensions 为数组，每项包含 key,label,enabled。'
  ].join('\n');
}

export async function onRequestPost(ctx) {
  const user = await currentUser(ctx.request, ctx.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const settings = await loadSettings(ctx.env.gpt_image2_db, user.id);
  const profile = selectedProfile(settings);
  const baseUrl = normalizeBaseUrl(profile.baseUrl);
  const apiKey = String(profile.apiKey || '').trim();
  let body = {};
  let files = [];
  try {
    const contentType = String(ctx.request.headers.get('Content-Type') || '').toLowerCase();
    if (contentType.includes('multipart/form-data')) {
      const form = await ctx.request.formData();
      body = {
        mode: String(form.get('mode') || 'ai'),
        prompt: String(form.get('prompt') || ''),
        params: parseJson(form.get('params'), {}),
        selectedDimensions: parseJson(form.get('selectedDimensions'), {}),
        structureLock: String(form.get('structureLock') || '') === 'true'
      };
      files = [...form.getAll('base[]'), ...form.getAll('ref[]')].filter((item) => item && typeof item.arrayBuffer === 'function');
    } else {
      body = await ctx.request.json().catch(() => ({}));
    }
  } catch (e) {
    return json({ analysis: fallbackAnalysis(body), warning: `分析请求解析失败：${e.message || String(e)}` }, 400);
  }
  if (!baseUrl || !apiKey) return json({ analysis: fallbackAnalysis(body), warning: 'API 配置不完整，已返回本地建议。' });
  if (!files.length) return json({ analysis: fallbackAnalysis(body), warning: '未收到可读图片，已返回本地建议。' });
  try {
    const imageContent = [];
    for (const file of files.slice(0, 4)) {
      imageContent.push({ type: 'input_image', image_url: await fileToDataUrl(file) });
    }
    const input = [{
      role: 'user',
      content: [
        { type: 'input_text', text: contentText(body, files.length) },
        ...imageContent
      ]
    }];
    const res = await fetch(`${baseUrl}/responses`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: profile.model, input })
    });
    const text = await res.text();
    if (!res.ok) throw new Error(text.slice(0, 500));
    const data = JSON.parse(text);
    const content = data.output_text || data.text || data.output?.[0]?.content?.[0]?.text || data.output?.[0]?.content?.map?.((item) => item.text).filter(Boolean).join('\n') || '';
    const analysis = jsonFromModelText(content, fallbackAnalysis(body));
    return json({ analysis, raw: data, imageCount: files.length });
  } catch (e) {
    return json({ analysis: fallbackAnalysis(body), warning: e.message || String(e) });
  }
}
