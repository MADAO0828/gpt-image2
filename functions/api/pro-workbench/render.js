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
function asBool(value, fallback = false) { return value === undefined || value === null ? fallback : !!value; }
function asNum(value, fallback) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function normalizeBaseUrl(raw) { let value = String(raw || '').trim().replace(/\/+$/, ''); if (!value) return ''; if (!/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(value)) value = 'https://' + value; try { const url = new URL(value); const parts = url.pathname.split('/').filter(Boolean); if (!parts.includes('v1')) parts.push('v1'); url.pathname = '/' + parts.join('/'); url.search = ''; url.hash = ''; return url.toString().replace(/\/+$/, ''); } catch { return value.replace(/\/+$/, '') + '/v1'; } }
function selectedProfile(settings, explicitProfileId = '') { const profiles = Array.isArray(settings.profiles) ? settings.profiles : []; const explicit = profiles.find(p => p && (p.id === explicitProfileId || p.name === explicitProfileId) && (p.apiMode || 'images') === 'images'); const preferredId = explicitProfileId || settings.activeImageProfileId || settings.activeProfileId || settings.agentImageProfileId || (profiles[0] && profiles[0].id) || 'default-openai'; const imageProfile = explicit || profiles.find(p => p && p.id === preferredId && (p.apiMode || 'images') === 'images'); const base = imageProfile || profiles.find(p => p && (p.apiMode || 'images') === 'images') || profiles.find(p => p && p.id === preferredId) || profiles[0] || {}; return { id: base.id || preferredId, name: base.name || '云端配置', provider: base.provider || 'openai', baseUrl: firstString(base.baseUrl, settings.baseUrl), nativeBaseUrl: firstString(base.nativeBaseUrl, base.googleNativeBaseUrl, settings.nativeBaseUrl, settings.googleNativeBaseUrl), apiKey: firstString(base.apiKey, settings.apiKey), nativeApiKey: firstString(base.nativeApiKey, base.googleNativeApiKey, settings.nativeApiKey, settings.googleNativeApiKey), model: firstString(base.model, settings.model) || 'gpt-image-2', timeout: asNum(base.timeout, asNum(settings.timeout, 600)), responseFormatB64Json: asBool(base.responseFormatB64Json, asBool(settings.responseFormatB64Json, false)), streamImages: asBool(base.streamImages, asBool(settings.streamImages, false)), streamPartialImages: asNum(base.streamPartialImages, asNum(settings.streamPartialImages, 1)) }; }
function providerKey(profile) { const raw = String(profile.provider || '').toLowerCase(); if (raw.includes('google') || /gemini|banana/i.test(profile.model || '')) return 'google'; if (raw.includes('xai') || raw.includes('grok') || /grok/i.test(profile.model || '')) return 'xai'; return 'openai'; }
function formBool(form, key, fallback) { const value = form.get(key); if (value === null || value === undefined || value === '') return fallback; return /^(1|true|yes|on|b64_json)$/i.test(String(value)); }
function formNum(form, key, fallback) { const n = Number(form.get(key)); return Number.isFinite(n) ? n : fallback; }
function supportsStream(profile) { return providerKey(profile) === 'openai'; }
function providerPayload(provider, params) {
  if (provider === 'google') {
    const imageSize = params.resolution || params.image_size || params.size || '2K';
    const aspectRatio = params.aspectRatio || params.aspect_ratio || '1:1';
    const targetSize = googleOfficialImageSize(imageSize, aspectRatio);
    const normalizedImageSize = String(imageSize || '').toUpperCase();
    return {
      resolution: imageSize,
      aspect_ratio: aspectRatio,
      image_size: imageSize,
      size: imageSize,
      target_size: targetSize || undefined,
      extra_body: {
        generationConfig: {
          response_modalities: ['IMAGE', 'TEXT'],
          responseModalities: ['IMAGE', 'TEXT'],
          imageConfig: {
            imageSize: normalizedImageSize,
            aspectRatio,
            image_size: normalizedImageSize,
            aspect_ratio: aspectRatio
          }
        },
        generation_config: {
          response_modalities: ['IMAGE', 'TEXT'],
          responseModalities: ['IMAGE', 'TEXT'],
          imageConfig: {
            imageSize: normalizedImageSize,
            aspectRatio,
            image_size: normalizedImageSize,
            aspect_ratio: aspectRatio
          }
        }
      },
      response_format: 'url'
    };
  }
  if (provider === 'xai') return { resolution: params.resolution || '2k', aspect_ratio: params.aspect_ratio || '1:1' };
  return { size: params.size || 'auto' };
}
const GOOGLE_OFFICIAL_IMAGE_SIZES = {
  '1K': { '1:1': '1024x1024', '3:2': '1264x848', '2:3': '848x1264', '16:9': '1376x768', '9:16': '768x1376', '4:3': '1200x896', '3:4': '896x1200', '4:5': '928x1152', '5:4': '1152x928', '21:9': '1584x672' },
  '2K': { '1:1': '2048x2048', '3:2': '2528x1696', '2:3': '1696x2528', '16:9': '2752x1536', '9:16': '1536x2752', '4:3': '2400x1792', '3:4': '1792x2400', '4:5': '1856x2304', '5:4': '2304x1856', '21:9': '3168x1344' },
  '4K': { '1:1': '4096x4096', '3:2': '5056x3392', '2:3': '3392x5056', '16:9': '5504x3072', '9:16': '3072x5504', '4:3': '4800x3584', '3:4': '3584x4608', '4:5': '3712x4608', '5:4': '4608x3712', '21:9': '6336x2688' }
};
function googleOfficialImageSize(resolution, aspectRatio) {
  const tier = String(resolution || '').trim().toUpperCase();
  const ratio = String(aspectRatio || '1:1').trim() || '1:1';
  return GOOGLE_OFFICIAL_IMAGE_SIZES[tier]?.[ratio] || '';
}
function modeLabel(mode) {
  return mode === 'styleTransfer' ? '灵感迁移' : mode === 'manual' ? '手动模式' : 'AI 模式';
}

export async function onRequestPost(ctx) {
  const started = Date.now();
  const user = await currentUser(ctx.request, ctx.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const settings = await loadSettings(ctx.env.gpt_image2_db, user.id);
  const form = await ctx.request.formData();
  const profile = selectedProfile(settings, String(form.get('profileId') || ''));
  const baseUrl = normalizeBaseUrl(profile.baseUrl);
  const apiKey = String(profile.apiKey || '').trim();
  if (!baseUrl) return json({ error: 'API configuration is incomplete: missing API URL' }, 500);
  if (!apiKey) return json({ error: 'API configuration is incomplete: missing API Key' }, 500);
  const mode = String(form.get('mode') || 'ai');
  const prompt = String(form.get('prompt') || '').trim();
  const params = JSON.parse(String(form.get('params') || '{}'));
  const analysis = JSON.parse(String(form.get('analysis') || '{}'));
  if (!prompt) return json({ error: 'Prompt is required' }, 400);
  const files = [...form.getAll('base[]'), ...form.getAll('ref[]')].filter((item) => item && typeof item.arrayBuffer === 'function');
  if (!files.length) return json({ error: 'At least one image is required' }, 400);
  const provider = providerKey(profile);
  const upstreamPath = files.length ? 'images/edits' : 'images/generations';
  const fd = new FormData();
  fd.append('model', profile.model || 'gpt-image-2');
  fd.append('prompt', [
    `${modeLabel(mode)}专业渲染任务`,
    '强保原图建筑结构、透视关系、体块比例、开窗位置、主要构图和空间边界；只调整时间、天气、灯光、材质、配景、人物前景、画面表现和后期调色。',
    prompt,
    analysis.review ? `读图审片：${analysis.review}` : '',
    analysis.intent ? `意图理解：${analysis.intent}` : '',
    analysis.strategy ? `策略封装：${analysis.strategy}` : '',
    Array.isArray(analysis.dimensions) ? `迁移/控制维度：${analysis.dimensions.filter(d => d.enabled !== false).map(d => d.label || d.key || d).join('、')}` : '',
    analysis.negative ? `避免：${analysis.negative}` : ''
  ].filter(Boolean).join('\n'));
  Object.entries(providerPayload(provider, params)).forEach(([k, v]) => fd.append(k, v && typeof v === 'object' ? JSON.stringify(v) : String(v)));
  const outputFormat = String(params.output_format || params.format || settings.output_format || 'png').toLowerCase();
  fd.append('quality', String(params.quality || settings.quality || 'high'));
  fd.append('n', String(provider === 'google' ? 1 : asNum(params.count || params.n || settings.n, 1)));
  fd.append('output_format', outputFormat);
  fd.append('moderation', String(params.moderation || settings.moderation || 'auto'));
  if (outputFormat === 'png') {
    const transparentValue = params.transparent_background ?? params.transparent ?? settings.transparent_output ?? false;
    fd.append('transparent_background', String(transparentValue));
    if (/^(1|true|yes|on)$/i.test(String(transparentValue))) fd.append('background', 'transparent');
  }
  else fd.append('output_compression', String(params.output_compression || params.compression || settings.output_compression || 90));
  const imageFieldName = provider === 'google' ? 'image[]' : 'image';
  files.forEach((file, index) => fd.append(imageFieldName, file, file.name || `pro-reference-${index + 1}.png`));
  if (formBool(form, 'response_format', profile.responseFormatB64Json) && provider !== 'google' && provider !== 'xai') fd.append('response_format', 'b64_json');
  if (formBool(form, 'stream', profile.streamImages) && supportsStream(profile)) {
    fd.append('stream', 'true');
    fd.append('partial_images', String(Math.max(0, Math.min(3, formNum(form, 'partial_images', profile.streamPartialImages || 1)))));
  }
  const controller = new AbortController();
  const timeoutOverride = Number(ctx.request.headers.get('X-GPT-Image-Timeout-Seconds'));
  const timeoutId = setTimeout(() => controller.abort(), Math.max(1000, Math.min(Number(timeoutOverride || profile.timeout || 600) * 1000, 6000 * 1000)));
  try {
    let data;
    const res = await fetch(`${baseUrl}/${upstreamPath}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: fd,
      signal: controller.signal
    });
    const text = await res.text();
    if (!res.ok) return json({ error: `上游渲染失败：${text.slice(0, 600)}` }, res.status);
    data = JSON.parse(text);
    return json({
      ...data,
      returnedPrompt: data.revised_prompt || data.revisedPrompt || prompt,
      returnedParams: {
        source: `${profile.name} · ${profile.model}`,
        size: data.size || params.size || params.resolution || 'auto',
        aspectRatio: data.aspect_ratio || data.aspectRatio || params.aspectRatio || params.aspect_ratio || 'auto',
        quality: params.quality || settings.quality || 'high',
        format: outputFormat,
        compression: params.output_compression || params.compression || settings.output_compression || 90,
        transparent: !!(params.transparent_background ?? params.transparent ?? settings.transparent_output),
        moderation: params.moderation || settings.moderation || 'auto',
        count: Array.isArray(data.data) ? data.data.length : asNum(params.count || params.n || settings.n, 1)
      },
      workflowName: '专业工作台',
      workflowNodeId: mode,
      batchLabel: modeLabel(mode),
      proMode: mode,
      analysisSnapshot: analysis,
      selectedDimensions: analysis.dimensions || params.selectedDimensions || {},
      structureLock: true,
      elapsedMs: Date.now() - started
    });
  } catch (e) {
    const status = e.name === 'AbortError' ? 504 : 502;
    const modeText = files.length ? '参考图渲染' : '纯提示词渲染';
    const suggestion = provider === 'google' || provider === 'xai' ? '参考图请求已走当前中转站兼容接口；请检查该模型的图生图通道状态、图片大小/格式和服务商后台错误。' : '请检查 API 地址、模型名称和服务商状态后重试。';
    return json({ error: e.name === 'AbortError' ? '专业渲染等待上游超时' : `专业渲染代理失败：${e.message || String(e)}。模型：${profile.name || profile.id || profile.model} / ${profile.model}；供应商：${provider}；模式：${modeText}。${suggestion}` }, status);
  } finally {
    clearTimeout(timeoutId);
  }
}
