import { currentUser, json } from '../../_lib/auth.js';
import { normalizeSafeBaseUrl, safeUpstreamEndpoint } from '../../_lib/upstream-url.js';
async function loadSettings(db, userId) { const rows = await db.prepare('SELECT key, value FROM user_settings WHERE user_id = ?').bind(userId).all(); const settings = {}; (rows.results || []).forEach(row => { try { settings[row.key] = JSON.parse(row.value); } catch { settings[row.key] = row.value; } }); return settings; }
function firstString() { for (let i = 0; i < arguments.length; i++) { const v = arguments[i]; if (typeof v === 'string' && v.trim()) return v.trim(); } return ''; }
function asBool(value, fallback = false) { return value === undefined || value === null ? fallback : !!value; }
function asNum(value, fallback) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function normalizeImageQuality(value, fallback = 'high') { const normalized = String(value || '').trim().toLowerCase(); if (['auto', 'low', 'medium', 'high'].includes(normalized)) return normalized; if (normalized === 'hd') return 'high'; if (normalized === 'standard') return 'medium'; return ['auto', 'low', 'medium', 'high'].includes(fallback) ? fallback : 'high'; }
function normalizeBaseUrl(raw) { return normalizeSafeBaseUrl(raw, true); }
function selectedProfile(settings, explicitProfileId = '') { const profiles = Array.isArray(settings.profiles) ? settings.profiles : []; const find = id => profiles.find(p => p && (p.id === id || p.name === id)) || null; let base = null; let preferredId = ''; if (explicitProfileId) { preferredId = explicitProfileId; base = find(explicitProfileId); if (!base || (base.apiMode || 'images') !== 'images') throw new Error('Selected render profile is missing or does not support Images API'); } else if (settings.activeImageProfileId) { preferredId = settings.activeImageProfileId; base = find(preferredId); if (!base || (base.apiMode || 'images') !== 'images') throw new Error('Active image profile is missing or does not support Images API'); } else { preferredId = settings.activeProfileId || (profiles[0] && profiles[0].id) || 'default-openai'; const active = find(preferredId); base = active && (active.apiMode || 'images') === 'images' ? active : profiles.find(p => p && (p.apiMode || 'images') === 'images') || null; } base = base || {}; return { id: base.id || preferredId, name: base.name || '云端配置', provider: base.provider || 'openai', baseUrl: firstString(base.baseUrl, settings.baseUrl), nativeBaseUrl: firstString(base.nativeBaseUrl, base.googleNativeBaseUrl, settings.nativeBaseUrl, settings.googleNativeBaseUrl), apiKey: firstString(base.apiKey, settings.apiKey), nativeApiKey: firstString(base.nativeApiKey, base.googleNativeApiKey, settings.nativeApiKey, settings.googleNativeApiKey), model: firstString(base.model, settings.model) || 'gpt-image-2', codexCli: asBool(base.codexCli, asBool(settings.codexCli, false)), timeout: asNum(base.timeout, asNum(settings.timeout, 600)), responseFormatB64Json: asBool(base.responseFormatB64Json, asBool(settings.responseFormatB64Json, false)), streamImages: asBool(base.streamImages, asBool(settings.streamImages, false)), streamPartialImages: asNum(base.streamPartialImages, asNum(settings.streamPartialImages, 1)) }; }
function providerKey(profile) { const raw = String(profile.provider || '').toLowerCase(); if (raw.includes('google') || /gemini|banana/i.test(profile.model || '')) return 'google'; if (raw.includes('xai') || raw.includes('grok') || /grok/i.test(profile.model || '')) return 'xai'; return 'openai'; }
function formBool(form, key, fallback) { const value = form.get(key); if (value === null || value === undefined || value === '') return fallback; return /^(1|true|yes|on|b64_json)$/i.test(String(value)); }
function formNum(form, key, fallback) { const n = Number(form.get(key)); return Number.isFinite(n) ? n : fallback; }
function supportsStream(profile) { return providerKey(profile) === 'openai'; }
function boundedPartialImages(value, fallback = 1) { const number = Number(value); const fallbackNumber = Number(fallback); const normalized = Number.isFinite(number) ? number : (Number.isFinite(fallbackNumber) ? fallbackNumber : 1); return Math.max(0, Math.min(3, Math.floor(normalized))); }
function parseStreamDataBlock(block) {
  const data = String(block || '').split(/\r?\n/).filter(line => /^\s*data\s*:/i.test(line)).map(line => line.replace(/^\s*data\s*:\s?/i, '')).join('\n').trim();
  return data && data !== '[DONE]' ? data : '';
}
function streamEventType(payload) {
  const type = String(payload?.type || payload?.event || '').toLowerCase();
  const object = String(payload?.object || '').toLowerCase();
  const upstreamType = String(payload?.upstream_event_type || payload?.upstreamEventType || '').toLowerCase();
  const terminal = /(?:image[._](?:generation|edit)\.(?:result|completed|failed|error|incomplete|cancelled|canceled)|response\.)/;
  if (terminal.test(object)) return object;
  if (terminal.test(upstreamType)) return upstreamType;
  return type || object || upstreamType;
}
function streamCandidateFromObject(payload, object) {
  if (!object || typeof object !== 'object') return null;
  const b64 = [object.b64_json, object.b64Json, object.base64, object.base64_image, object.base64Image, object.image_base64, object.imageBase64]
    .find(value => typeof value === 'string' && value.trim());
  const dataUrl = [object.data_url, object.dataUrl, object.image_data_url, object.imageDataUrl]
    .find(value => typeof value === 'string' && /^data:image\//i.test(value.trim()));
  const url = [object.url, object.image_url, object.imageUrl, object.uri, object.src, object.href, object.download_url, object.downloadUrl]
    .find(value => typeof value === 'string' && /^https?:\/\//i.test(value.trim()));
  const rawImage = typeof object.image === 'string' ? object.image.trim() : '';
  if (!b64 && !dataUrl && !url && rawImage) {
    if (/^data:image\//i.test(rawImage)) return { ...object, data_url: rawImage };
    if (/^https?:\/\//i.test(rawImage)) return { ...object, url: rawImage };
    if (/^[A-Za-z0-9+/_=-]{16,}$/.test(rawImage)) return { ...object, b64_json: rawImage };
  }
  if (!b64 && !dataUrl && !url) return null;
  return {
    ...object,
    ...(b64 ? { b64_json: b64 } : {}),
    ...(dataUrl ? { data_url: dataUrl } : {}),
    ...(url ? { url } : {})
  };
}
function collectStreamImageCandidates(payload) {
  const candidates = [];
  const seenObjects = new Set();
  const seenValues = new Set();
  const imageKeys = new Set([
    'b64_json', 'b64json', 'base64', 'base64_image', 'base64image',
    'image_base64', 'imagebase64', 'image_data', 'imagedata',
    'image_bytes', 'imagebytes', 'image', 'images', 'data_url', 'dataurl',
    'image_data_url', 'imagedataurl', 'url', 'image_url', 'imageurl',
    'uri', 'src', 'href', 'download_url', 'downloadurl', 'data'
  ]);
  const stack = [{ value: payload, key: '', depth: 0 }];
  let scanned = 0;
  while (stack.length && scanned < 20000) {
    const entry = stack.pop();
    const value = entry?.value;
    const key = String(entry?.key || '').replace(/[-\s]/g, '_').toLowerCase();
    const depth = Number(entry?.depth) || 0;
    if (value === null || value === undefined || depth > 12) continue;
    if (typeof value === 'string') {
      const text = value.trim();
      if (imageKeys.has(key) && (/^data:image\//i.test(text) || /^https?:\/\//i.test(text) || /^[A-Za-z0-9+/_=-]{16,}$/.test(text))) {
        const key = text;
        if (!seenValues.has(key)) {
          seenValues.add(key);
          candidates.push(/^data:image\//i.test(text) ? { data_url: text } : /^https?:\/\//i.test(text) ? { url: text } : { b64_json: text });
        }
      }
      continue;
    }
    if (typeof value !== 'object' || seenObjects.has(value)) continue;
    seenObjects.add(value);
    scanned += 1;
    const candidate = streamCandidateFromObject(payload, value);
    if (candidate) {
      const key = String(candidate.b64_json || candidate.data_url || candidate.url || '');
      if (!seenValues.has(key)) {
        seenValues.add(key);
        candidates.push(candidate);
      }
    }
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) stack.push({ value: value[index], key, depth: depth + 1 });
    } else {
      const entries = Object.entries(value);
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const [childKey, child] = entries[index];
        if (candidate && imageKeys.has(String(childKey).replace(/[-\s]/g, '_').toLowerCase()) && typeof child !== 'object') continue;
        stack.push({ value: child, key: childKey, depth: depth + 1 });
      }
    }
  }
  return candidates;
}
function streamFailureMessage(payload) {
  const type = streamEventType(payload);
  const status = String(payload?.status || payload?.response?.status || '').toLowerCase();
  const explicit = payload?.error?.message || (typeof payload?.error === 'string' ? payload.error : '') || payload?.response?.error?.message;
  if (!explicit && !/(?:failed|error|incomplete|cancelled|canceled)$/.test(type) && !['failed', 'error', 'incomplete', 'cancelled', 'canceled'].includes(status)) return '';
  return String(explicit || payload?.response?.incomplete_details?.reason || payload?.incomplete_details?.reason || payload?.message || `专业工作台流式接口以 ${status || type.split('.').at(-1) || '失败'} 状态结束`);
}
function streamPayloadWithCandidates(payload, candidates) {
  if (candidates.length) return { ...payload, data: candidates };
  return payload;
}
async function readImageStreamResponse(response) {
  const reader = response.body?.getReader?.();
  if (!reader) throw new Error('专业工作台未收到可读取的流式响应');
  const decoder = new TextDecoder();
  let buffer = '';
  let finalEvent = null;
  const partialByOutput = new Map();
  let doneSignal = false;
  const streamEvents = [];
  let partialCount = 0;
  let lastStreamEventType = '';
  const partialCandidates = () => [...partialByOutput.values()].sort((a, b) => a.outputIndex - b.outputIndex).map((item) => item.candidate);
  const streamContext = () => ({
    partialCandidates: partialCandidates(),
    streamEvents: [...streamEvents],
    streamEventCount: streamEvents.length,
    partialCount,
    lastStreamEventType
  });
  const consumeBlock = (block) => {
    if (String(block || '').split(/\r?\n/).some(line => /^\s*data\s*:\s*\[DONE\]\s*$/i.test(line))) {
      doneSignal = true;
      return true;
    }
    const data = parseStreamDataBlock(block);
    if (!data) return false;
    let payload;
    try { payload = JSON.parse(data); } catch { throw new Error('专业工作台收到无法解析的流式数据'); }
    const type = streamEventType(payload);
    const candidates = collectStreamImageCandidates(payload);
    lastStreamEventType = type;
    streamEvents.push({
      type: type.slice(0, 80),
      keys: Object.keys(payload || {}).filter(key => !/(?:b64|base64|image_data)/i.test(key)).slice(0, 12),
      candidateCount: candidates.length,
      hasError: Boolean(payload?.error || payload?.response?.error)
    });
    if (streamEvents.length > 24) streamEvents.shift();
    const isPartial = /partial_image$/.test(type) || type === 'image.generation.chunk';
    const isTerminal = type === 'image.generation.result'
      || type === 'image.edit.result'
      || /(?:image[._](?:generation|edit)|response)\.(?:completed|done)$/.test(type)
      || ['completed', 'succeeded'].includes(String(payload?.status || payload?.response?.status || '').toLowerCase());
    if (isPartial && candidates.length) {
      candidates.forEach((candidate, index) => {
        const rawOutputIndex = candidate?.output_index ?? candidate?.outputIndex ?? payload?.output_index ?? payload?.outputIndex;
        const outputIndex = Number.isFinite(Number(rawOutputIndex)) ? Number(rawOutputIndex) : index;
        const normalizedCandidate = {
          ...candidate,
          output_index: outputIndex,
          outputIndex
        };
        partialByOutput.set(outputIndex, { outputIndex, candidate: normalizedCandidate });
      });
      partialCount += candidates.length;
    }
    const failure = streamFailureMessage(payload);
    if (failure) {
      const error = new Error(failure);
      Object.assign(error, streamContext());
      throw error;
    }
    if (isTerminal) {
      if (candidates.length) finalEvent = streamPayloadWithCandidates(payload, candidates);
      else if (partialByOutput.size) {
        finalEvent = null;
        doneSignal = true;
      } else {
        doneSignal = true;
      }
      return true;
    }
    return false;
  };
  try {
    while (!finalEvent && !doneSignal) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let separator = buffer.search(/\r?\n\r?\n/);
      while (separator >= 0 && !finalEvent) {
        const match = buffer.match(/\r?\n\r?\n/);
        const block = buffer.slice(0, separator);
        buffer = buffer.slice(separator + (match?.[0]?.length || 2));
        if (consumeBlock(block)) break;
        separator = buffer.search(/\r?\n\r?\n/);
      }
    }
  } catch (error) {
    Object.assign(error, streamContext());
    await reader.cancel?.().catch?.(() => {});
    throw error;
  }
  if (finalEvent || doneSignal) await reader.cancel?.().catch?.(() => {});
  buffer += decoder.decode();
  if (!finalEvent && !doneSignal && buffer.trim()) {
    try {
      consumeBlock(buffer);
    } catch (error) {
      Object.assign(error, streamContext());
      throw error;
    }
  }
  if (!finalEvent) {
    const error = new Error(partialByOutput.size ? '专业工作台流式接口只返回预览图，未收到最终图片' : '专业工作台流式接口未返回图片数据');
    error.code = partialByOutput.size ? 'IMAGE_STREAM_PARTIAL_ONLY' : 'IMAGE_STREAM_NO_IMAGE';
    error.stage = 'stream-complete';
    Object.assign(error, streamContext());
    throw error;
  }
  const payload = finalEvent;
  if (Array.isArray(payload.data)) return payload;
  if (payload.b64_json || payload.url || payload.image) return { ...payload, data: [payload] };
  throw new Error('专业工作台流式接口未返回可识别的图片数据');
}
async function readImageResponsePayload(response) {
  if (!response?.body) throw new Error('专业工作台未收到图片响应');
  const contentType = String(response.headers?.get?.('Content-Type') || '').toLowerCase();
  let probeBody;
  let replayBody;
  if (response.body.tee) {
    [probeBody, replayBody] = response.body.tee();
  } else if (response.clone) {
    probeBody = response.body;
    replayBody = response.clone().body;
  } else {
    throw new Error('专业工作台图片响应无法重复读取');
  }
  const probeReader = probeBody.getReader();
  const decoder = new TextDecoder();
  let prefix = '';
  try {
    while (prefix.length < 8192) {
      const { value, done } = await probeReader.read();
      if (done) break;
      prefix += decoder.decode(value, { stream: true });
      const normalized = prefix.replace(/^\uFEFF/, '').trimStart();
      if (/^(?:data|event|id|retry)\s*:/i.test(normalized) || normalized.startsWith(':') || normalized.startsWith('{') || normalized.startsWith('[')) break;
    }
    prefix += decoder.decode();
  } finally {
    probeReader.cancel?.().catch?.(() => {});
  }
  const normalized = prefix.replace(/^\uFEFF/, '').trimStart();
  const looksLikeSse = /^(?:data|event|id|retry)\s*:/i.test(normalized) || normalized.startsWith(':') || contentType.includes('text/event-stream');
  const replay = new Response(replayBody, { status: response.status, statusText: response.statusText, headers: response.headers });
  if (looksLikeSse) return readImageStreamResponse(replay);
  const text = await replay.text();
  try {
    return JSON.parse(text || '{}');
  } catch {
    if (/^(?:data|event|id|retry)\s*:/i.test(normalized) || normalized.startsWith(':')) return readImageStreamResponse(new Response(new TextEncoder().encode(text), { status: response.status, headers: { 'Content-Type': 'text/event-stream' } }));
    throw new Error('专业工作台返回了无法解析的图片响应');
  }
}
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
  let profile;
  try {
    profile = selectedProfile(settings, String(form.get('profileId') || ''));
  } catch (error) {
    return json({ error: error?.message || 'Invalid image profile configuration', code: 'INVALID_PROFILE_CONFIGURATION' }, 400);
  }
  let baseUrl = '';
  try {
    baseUrl = normalizeBaseUrl(profile.baseUrl);
  } catch (error) {
    return json({ error: error.message || 'API URL is invalid' }, 400);
  }
  const apiKey = String(profile.apiKey || '').trim();
  if (!baseUrl) return json({ error: 'API configuration is incomplete: missing API URL' }, 500);
  if (!apiKey) return json({ error: 'API configuration is incomplete: missing API Key' }, 500);
  const mode = String(form.get('mode') || 'ai');
  const prompt = String(form.get('prompt') || '').trim();
  const params = JSON.parse(String(form.get('params') || '{}'));
  const analysis = JSON.parse(String(form.get('analysis') || '{}'));
  if (!prompt) return json({ error: 'Prompt is required' }, 400);
  const files = [...form.getAll('base[]'), ...form.getAll('ref[]')].filter((item) => item && typeof item.arrayBuffer === 'function');
  const provider = providerKey(profile);
  const upstreamPath = files.length ? 'images/edits' : 'images/generations';
  const renderPrompt = [
    `${modeLabel(mode)}专业渲染任务`,
    '强保原图建筑结构、透视关系、体块比例、开窗位置、主要构图和空间边界；只调整时间、天气、灯光、材质、配景、人物前景、画面表现和后期调色。',
    prompt,
    analysis.review ? `读图审片：${analysis.review}` : '',
    analysis.intent ? `意图理解：${analysis.intent}` : '',
    analysis.strategy ? `策略封装：${analysis.strategy}` : '',
    Array.isArray(analysis.dimensions) ? `迁移/控制维度：${analysis.dimensions.filter(d => d.enabled !== false).map(d => d.label || d.key || d).join('、')}` : '',
    analysis.negative ? `避免：${analysis.negative}` : ''
  ].filter(Boolean).join('\n');
  const fd = new FormData();
  fd.append('model', profile.model || 'gpt-image-2');
  fd.append('prompt', renderPrompt);
  Object.entries(providerPayload(provider, params)).forEach(([k, v]) => fd.append(k, v && typeof v === 'object' ? JSON.stringify(v) : String(v)));
  const outputFormat = String(params.output_format || params.format || settings.output_format || 'png').toLowerCase();
  if (!profile.codexCli) fd.append('quality', normalizeImageQuality(params.quality || settings.quality));
  fd.append('n', String(provider === 'google' ? 1 : asNum(params.count || params.n || settings.n, 1)));
  fd.append('output_format', outputFormat);
  fd.append('moderation', String(params.moderation || settings.moderation || 'auto'));
  const outputCompression = params.output_compression ?? params.compression ?? settings.output_compression;
  if (outputFormat === 'png') {
    const transparentValue = params.transparent_background ?? params.transparent ?? settings.transparent_output ?? false;
    fd.append('transparent_background', String(transparentValue));
    if (/^(1|true|yes|on)$/i.test(String(transparentValue))) fd.append('background', 'transparent');
  }
  else fd.append('output_compression', String(outputCompression ?? 90));
  const imageFieldName = 'image[]';
  files.forEach((file, index) => fd.append(imageFieldName, file, file.name || `pro-reference-${index + 1}.png`));
  if (formBool(form, 'response_format', profile.responseFormatB64Json) && provider !== 'google' && provider !== 'xai') fd.append('response_format', 'b64_json');
  if (formBool(form, 'stream', profile.streamImages) && supportsStream(profile)) {
    fd.append('stream', 'true');
    fd.append('partial_images', String(boundedPartialImages(formNum(form, 'partial_images', profile.streamPartialImages), 1)));
  }
  const requestBody = files.length ? fd : (() => {
    const count = asNum(params.count || params.n || settings.n, 1);
    const body = {
      model: profile.model || 'gpt-image-2',
      prompt: renderPrompt,
      ...providerPayload(provider, params),
      output_format: outputFormat,
      moderation: String(params.moderation || settings.moderation || 'auto')
    };
    if (!profile.codexCli) body.quality = normalizeImageQuality(params.quality || settings.quality);
    if (provider !== 'google' && count > 1) body.n = count;
    if (outputFormat === 'png') {
      const transparentValue = params.transparent_background ?? params.transparent ?? settings.transparent_output ?? false;
      body.transparent_background = transparentValue;
      if (/^(1|true|yes|on)$/i.test(String(transparentValue))) body.background = 'transparent';
    } else {
      body.output_compression = outputCompression ?? 90;
    }
    if (formBool(form, 'response_format', profile.responseFormatB64Json) && provider !== 'google' && provider !== 'xai') body.response_format = 'b64_json';
    if (formBool(form, 'stream', profile.streamImages) && supportsStream(profile)) {
      body.stream = true;
      body.partial_images = boundedPartialImages(formNum(form, 'partial_images', profile.streamPartialImages), 1);
    }
    return JSON.stringify(body);
  })();
  const requestHeaders = {
    Authorization: `Bearer ${apiKey}`,
    ...(files.length ? {} : { 'Content-Type': 'application/json' })
  };
  const controller = new AbortController();
  const timeoutOverride = Number(ctx.request.headers.get('X-GPT-Image-Timeout-Seconds'));
  const timeoutId = setTimeout(() => controller.abort(), Math.max(1000, Math.min(Number(timeoutOverride || profile.timeout || 600) * 1000, 6000 * 1000)));
  try {
    let data;
    const res = await fetch(safeUpstreamEndpoint(baseUrl, upstreamPath), {
      method: 'POST',
      headers: requestHeaders,
      body: requestBody,
      signal: controller.signal,
      redirect: 'manual'
    });
    if (!res.ok) {
      const text = await res.text();
      return json({ error: `上游渲染失败：${text.slice(0, 600)}` }, res.status);
    }
    data = await readImageResponsePayload(res);
    return json({
      ...data,
      returnedPrompt: data.revised_prompt || data.revisedPrompt || prompt,
      returnedParams: {
        source: `${profile.name} · ${profile.model}`,
        size: data.size || params.size || params.resolution || 'auto',
        aspectRatio: data.aspect_ratio || data.aspectRatio || params.aspectRatio || params.aspect_ratio || 'auto',
        quality: normalizeImageQuality(params.quality || settings.quality),
        format: outputFormat,
        compression: outputCompression ?? 90,
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
    return json({
      error: e.name === 'AbortError' ? '专业渲染等待上游超时' : `专业渲染代理失败：${e.message || String(e)}。模型：${profile.name || profile.id || profile.model} / ${profile.model}；供应商：${provider}；模式：${modeText}。${suggestion}`,
      code: e.code || (e.name === 'AbortError' ? 'PRO_WORKBENCH_TIMEOUT' : 'PRO_WORKBENCH_RENDER_FAILED'),
      stage: e.stage || 'render-request',
      partialCandidates: Array.isArray(e.partialCandidates) ? e.partialCandidates : [],
      streamEvents: Array.isArray(e.streamEvents) ? e.streamEvents : [],
      streamEventCount: Number(e.streamEventCount || 0),
      partialCount: Number(e.partialCount || 0),
      lastStreamEventType: e.lastStreamEventType || ''
    }, status);
  } finally {
    clearTimeout(timeoutId);
  }
}
