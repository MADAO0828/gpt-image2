import { currentUser, json } from '../../_lib/auth.js';
import { bindClientAbort, fetchPinnedUpstream, isUpstreamTimeoutStatus, normalizeSafeBaseUrl, normalizeUpstreamTimeoutSeconds, safeUpstreamEndpoint } from '../../_lib/upstream-url.js';
const MAX_WORKBENCH_REQUEST_BYTES = 64 * 1024 * 1024;
const MAX_WORKBENCH_FILE_BYTES = 20 * 1024 * 1024;
const MAX_WORKBENCH_TOTAL_FILE_BYTES = 48 * 1024 * 1024;
const MAX_WORKBENCH_FILE_COUNT = 14;
function requiresRequestDuplex(body) {
  if (!body || typeof body !== 'object') return false;
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return false;
  if (typeof FormData !== 'undefined' && body instanceof FormData) return false;
  if (typeof Blob !== 'undefined' && body instanceof Blob) return false;
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return false;
  return typeof body.getReader === 'function' || typeof body.pipe === 'function' || typeof body[Symbol.asyncIterator] === 'function';
}
async function requestWithBodyLimit(request, maxBytes) {
  const declared = Number(request?.headers?.get?.('Content-Length') || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw Object.assign(new Error('专业工作台请求体超过安全上限'), { code: 'PRO_WORKBENCH_REQUEST_TOO_LARGE', status: 413 });
  }
  const body = request?.body;
  if (!body?.tee || typeof ReadableStream === 'undefined') return request;
  const [probeBody, replayBody] = body.tee();
  const reader = probeBody.getReader();
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += Number(value?.byteLength || 0);
      if (total > maxBytes) {
        const error = Object.assign(new Error('专业工作台请求体超过安全上限'), { code: 'PRO_WORKBENCH_REQUEST_TOO_LARGE', status: 413 });
        await replayBody.cancel(error).catch(() => {});
        throw error;
      }
    }
  } finally {
    reader.releaseLock?.();
  }
  const init = { body: replayBody };
  if (requiresRequestDuplex(replayBody)) init.duplex = 'half';
  return new Request(request, init);
}
function validateWorkbenchUpload(request, files = null) {
  const declared = Number(request?.headers?.get?.('Content-Length') || 0);
  if (Number.isFinite(declared) && declared > MAX_WORKBENCH_REQUEST_BYTES) {
    throw Object.assign(new Error('专业工作台请求体超过安全上限'), { code: 'PRO_WORKBENCH_REQUEST_TOO_LARGE', status: 413 });
  }
  if (!Array.isArray(files)) return;
  if (files.length > MAX_WORKBENCH_FILE_COUNT) {
    throw Object.assign(new Error('专业工作台上传图片数量超过安全上限'), { code: 'PRO_WORKBENCH_FILE_COUNT_TOO_LARGE', status: 413 });
  }
  let totalBytes = 0;
  for (const file of files) {
    const size = Number(file?.size);
    if (!Number.isFinite(size) || size < 0 || size > MAX_WORKBENCH_FILE_BYTES) {
      throw Object.assign(new Error('专业工作台单张图片超过 20MB 安全上限'), { code: 'PRO_WORKBENCH_FILE_TOO_LARGE', status: 413 });
    }
    totalBytes += size;
  }
  if (totalBytes > MAX_WORKBENCH_TOTAL_FILE_BYTES) {
    throw Object.assign(new Error('专业工作台图片总大小超过 48MB 安全上限'), { code: 'PRO_WORKBENCH_TOTAL_TOO_LARGE', status: 413 });
  }
}
async function loadSettings(db, userId) { const rows = await db.prepare('SELECT key, value FROM user_settings WHERE user_id = ?').bind(userId).all(); const settings = {}; (rows.results || []).forEach(row => { try { settings[row.key] = JSON.parse(row.value); } catch { settings[row.key] = row.value; } }); return settings; }
function firstString() { for (let i = 0; i < arguments.length; i++) { const v = arguments[i]; if (typeof v === 'string' && v.trim()) return v.trim(); } return ''; }
function asNum(value, fallback) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function safeUpstreamDetail(value, secret) { const text = String(value || ''); return (secret ? text.split(secret).join('[redacted]') : text).slice(0, 500); }
function normalizeBaseUrl(raw) { return normalizeSafeBaseUrl(raw, true); }
function selectedProfile(settings, explicitProfileId = '') {
  const profiles = Array.isArray(settings.profiles) ? settings.profiles : [];
  const responsesProfiles = profiles.filter(profile => profile && profile.apiMode === 'responses');
  const byId = profileId => responsesProfiles.find(profile => profile.id === profileId || profile.name === profileId);
  const configMode = String(settings.agentApiConfigMode || 'off').toLowerCase();
  let preferredId = '';
  let base = null;

  if (configMode === 'hybrid') {
    preferredId = firstString(settings.agentTextProfileId);
    base = preferredId ? byId(preferredId) : null;
  } else {
    const explicit = firstString(explicitProfileId);
    preferredId = explicit || firstString(settings.activeProfileId);
    base = (explicit ? byId(explicit) : null)
      || byId(firstString(settings.activeProfileId))
      || responsesProfiles[0]
      || null;
  }

  const legacySettings = profiles.length === 0;
  base = base || {};
  return {
    id: base.id || preferredId || 'default-responses',
    name: base.name || '云端配置',
    provider: base.provider || 'openai',
    baseUrl: firstString(base.baseUrl, legacySettings ? settings.baseUrl : ''),
    apiKey: firstString(base.apiKey, legacySettings ? settings.apiKey : ''),
    model: firstString(base.model, legacySettings ? settings.model : '') || 'gpt-5-mini',
    timeout: asNum(base.timeout, asNum(legacySettings ? settings.timeout : undefined, 600))
  };
}
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
  try {
    validateWorkbenchUpload(ctx.request);
  } catch (error) {
    return json({ error: error.message, code: error.code }, error.status || 413);
  }
  const settings = await loadSettings(ctx.env.gpt_image2_db, user.id);
  const profile = selectedProfile(settings, ctx.request.headers.get('X-GPT-Image-Profile-Id') || '');
  let baseUrl = '';
  try {
    baseUrl = normalizeBaseUrl(profile.baseUrl);
  } catch (error) {
    return json({ error: error.message || 'API URL is invalid' }, 400);
  }
  const apiKey = String(profile.apiKey || '').trim();
  let body = {};
  let files = [];
  try {
    const contentType = String(ctx.request.headers.get('Content-Type') || '').toLowerCase();
    const boundedRequest = await requestWithBodyLimit(ctx.request, MAX_WORKBENCH_REQUEST_BYTES);
    if (contentType.includes('multipart/form-data')) {
      const form = await boundedRequest.formData();
      body = {
        mode: String(form.get('mode') || 'ai'),
        prompt: String(form.get('prompt') || ''),
        params: parseJson(form.get('params'), {}),
        selectedDimensions: parseJson(form.get('selectedDimensions'), {}),
        structureLock: String(form.get('structureLock') || '') === 'true'
      };
      files = [...form.getAll('base[]'), ...form.getAll('ref[]')].filter((item) => item && typeof item.arrayBuffer === 'function');
      validateWorkbenchUpload(ctx.request, files);
    } else {
      body = await boundedRequest.json().catch(() => ({}));
    }
  } catch (e) {
    return json({ analysis: fallbackAnalysis(body), warning: `分析请求解析失败：${e.message || String(e)}`, code: e?.code }, e?.status || 400);
  }
  if (!baseUrl || !apiKey) return json({ analysis: fallbackAnalysis(body), warning: 'API 配置不完整，已返回本地建议。' });
  if (!files.length) return json({ analysis: fallbackAnalysis(body), warning: '未收到可读图片，已返回本地建议。' });
  const headerValue = Number(ctx.request.headers.get('X-GPT-Image-Timeout-Seconds'));
  const requestedTimeout = Number.isFinite(headerValue) && headerValue > 0 ? headerValue : asNum(profile.timeout, 600);
  const timeoutSeconds = normalizeUpstreamTimeoutSeconds(requestedTimeout);
  const controller = new AbortController();
  const clientAbort = bindClientAbort(ctx.request, controller);
  const timeoutId = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
  let upstream = null;
  try {
    if (clientAbort.wasAborted()) return json({ error: 'Professional analysis request cancelled', code: 'CLIENT_ABORTED' }, 499);
    const imageContent = [];
    for (const file of files.slice(0, 4)) {
      if (clientAbort.wasAborted()) return json({ error: 'Professional analysis request cancelled', code: 'CLIENT_ABORTED' }, 499);
      imageContent.push({ type: 'input_image', image_url: await fileToDataUrl(file) });
    }
    const input = [{
      role: 'user',
      content: [
        { type: 'input_text', text: contentText(body, files.length) },
        ...imageContent
      ]
    }];
    const endpoint = safeUpstreamEndpoint(baseUrl, 'responses');
    const pinned = await fetchPinnedUpstream(endpoint, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: profile.model, input }),
      signal: controller.signal,
      redirect: 'manual'
    }, {
      allowedHosts: ctx.env?.UPSTREAM_ALLOWED_HOSTS,
      requireAllowlist: String(ctx.env?.UPSTREAM_ALLOWLIST_REQUIRED || '').toLowerCase() === 'true',
      allowPlatformDnsFallback: true
    });
    upstream = pinned.response;
    const text = await upstream.text();
    if (upstream.status >= 300 && upstream.status < 400) {
      return json({ error: '专业分析上游重定向已阻止', code: 'UPSTREAM_REDIRECT_BLOCKED', stage: 'upstream-redirect', analysis: fallbackAnalysis(body) }, 502);
    }
    if (!upstream.ok) {
      const detail = safeUpstreamDetail(text, apiKey);
      if (isUpstreamTimeoutStatus(upstream.status, text)) {
        return json({ error: '专业分析上游响应超时', code: 'UPSTREAM_CLOUDFLARE_TIMEOUT', stage: 'upstream-response', upstreamStatus: upstream.status, timeoutSeconds, detail, analysis: fallbackAnalysis(body) }, 504);
      }
      const error = new Error('Professional analysis upstream request failed');
      error.code = 'PRO_WORKBENCH_UPSTREAM_ERROR';
      error.status = 502;
      error.detail = detail;
      throw error;
    }
    const data = JSON.parse(text);
    const content = data.output_text || data.text || data.output?.[0]?.content?.[0]?.text || data.output?.[0]?.content?.map?.((item) => item.text).filter(Boolean).join('\n') || '';
    const analysis = jsonFromModelText(content, fallbackAnalysis(body));
    return json({ analysis, raw: data, imageCount: files.length });
  } catch (e) {
    if (clientAbort.wasAborted()) {
      return json({ error: 'Professional analysis request cancelled', code: 'CLIENT_ABORTED' }, 499);
    }
    if (controller.signal.aborted || e.name === 'AbortError' || e.code === 'UPSTREAM_DNS_TIMEOUT') {
      return json({
        error: '专业分析等待上游响应超时',
        code: 'PRO_WORKBENCH_ANALYZE_TIMEOUT',
        timeoutSeconds,
        analysis: fallbackAnalysis(body)
      }, 504);
    }
    if (e.code === 'UPSTREAM_DNS_REJECTED') return json({ error: e.message, code: e.code }, 400);
    if (e.code === 'UPSTREAM_HOST_ALLOWLIST_MISSING' || e.code === 'UPSTREAM_HOST_ALLOWLIST_INVALID' || e.code === 'UPSTREAM_HOST_NOT_ALLOWED') return json({ error: e.message, code: e.code, stage: 'upstream-host-policy', analysis: fallbackAnalysis(body) }, 400);
    if (e.code === 'UPSTREAM_DNS_REBOUND' || e.code === 'UPSTREAM_DNS_FAILED') return json({ error: e.message, code: e.code }, 502);
    const status = Number.isInteger(e?.status) && e.status >= 400 && e.status <= 599 ? e.status : 502;
    return json({ error: e?.message || 'Professional analysis upstream request failed', code: e?.code || 'PRO_WORKBENCH_ANALYZE_FAILED', stage: 'upstream-request', detail: e?.detail || safeUpstreamDetail(e?.message || String(e), apiKey), analysis: fallbackAnalysis(body) }, status);
  } finally {
    clearTimeout(timeoutId);
    clientAbort.cleanup();
  }
}
