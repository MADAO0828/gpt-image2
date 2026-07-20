(function initImageStreamRuntime(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.NexGenImageStream = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createImageStreamRuntime() {
  const DEFAULT_EVENT_LIMIT = 96 * 1024 * 1024;
  const DEFAULT_OUTPUT_LIMIT = 16;
  const DEFAULT_METADATA_LIMIT = 24;
  const DEFAULT_SCAN_DEPTH = 12;
  const DEFAULT_SCAN_NODES = 20000;

  function firstValue(...values) {
    return values.find((value) => value !== undefined && value !== null && value !== '');
  }

  function normalizeMimeType(value) {
    const raw = String(value || '').trim().toLowerCase().split(';')[0];
    if (raw === 'png' || raw === 'image/png') return 'image/png';
    if (raw === 'jpg' || raw === 'jpeg' || raw === 'image/jpg' || raw === 'image/jpeg') return 'image/jpeg';
    if (raw === 'webp' || raw === 'image/webp') return 'image/webp';
    if (raw === 'gif' || raw === 'image/gif') return 'image/gif';
    return /^image\/[a-z0-9.+-]+$/.test(raw) ? raw : '';
  }

  function classifyImageResponse(contentType, prefix = '') {
    const type = String(contentType || '').toLowerCase();
    const head = String(prefix || '').slice(0, 8192);
    if (/^\s*(?:data|event|id|retry)\s*:/i.test(head) || /^\s*:/i.test(head)) return 'sse-sniffed';
    if (type.includes('text/event-stream')) return 'sse';
    if (type.includes('json')) return head ? 'json' : 'undetermined';
    return head ? 'json' : 'undetermined';
  }

  function parseSseDataBlock(block) {
    return parseSseDataLines(block).join('\n').trim();
  }

  function parseSseDataLines(block) {
    return String(block || '')
      .split(/\r?\n/)
      .filter((line) => /^\s*data\s*:/i.test(line))
      .map((line) => line.replace(/^\s*data\s*:/i, '').replace(/^ /, ''));
  }

  function parseSseEventName(block) {
    const line = String(block || '')
      .split(/\r?\n/)
      .find((item) => /^\s*event\s*:/i.test(item));
    return line ? line.replace(/^\s*event\s*:/i, '').trim().slice(0, 160) : '';
  }

  function isImageTerminalEventType(type) {
    return /^(?:image[._](?:edit|generation))\.(?:result|completed|done)$/i.test(String(type || ''))
      || /^response\.(?:completed|done)$/i.test(String(type || ''));
  }

  function isImageResultEventType(type) {
    return /^(?:image[._](?:edit|generation))\.result$/i.test(String(type || ''));
  }

  function isImagePartialEventType(type) {
    return /^(?:image[._](?:edit|generation))\.(?:partial_image|chunk)$/i.test(String(type || ''));
  }

  function eventType(payload) {
    const type = String(firstValue(payload?.type, payload?.event) || '').toLowerCase();
    const object = String(payload?.object || '').toLowerCase();
    const upstreamType = String(payload?.upstream_event_type || payload?.upstreamEventType || '').toLowerCase();
    const terminalPattern = /(?:image[._](?:edit|generation)\.(?:result|completed|failed|error|incomplete|cancelled|canceled)|response\.)/;
    if (terminalPattern.test(object)) return object;
    if (terminalPattern.test(upstreamType)) return upstreamType;
    return type || object || upstreamType;
  }

  function eventErrorMessage(payload) {
    const type = eventType(payload);
    const status = String(firstValue(payload?.status, payload?.response?.status, '')).toLowerCase();
    const explicitError = firstValue(
      payload?.error?.message,
      typeof payload?.error === 'string' ? payload.error : undefined,
      payload?.response?.error?.message
    );
    const terminalFailure = /(?:failed|error|incomplete|cancelled|canceled)$/.test(type)
      || ['failed', 'error', 'incomplete', 'cancelled', 'canceled'].includes(status);
    if (!terminalFailure && !explicitError) return '';
    const fallback = status || type.split('.').at(-1) || 'failed';
    return String(firstValue(
      explicitError,
      payload?.response?.incomplete_details?.reason,
      payload?.incomplete_details?.reason,
      payload?.message,
      payload?.detail,
      `图片生成流以 ${fallback} 状态结束。`
    ));
  }

  const IMAGE_CANDIDATE_KEY = /^(?:b64_json|b64json|base64|base64_image|base64image|image_base64|imagebase64|image_data|imagedata|image_bytes|imagebytes|image|images|data_url|dataurl|image_data_url|imagedataurl|url|image_url|imageurl|uri|src|href|download_url|downloadurl)$/i;

  function isImageCandidateKey(value) {
    return IMAGE_CANDIDATE_KEY.test(String(value || ''));
  }

  function mimeFromDataUrl(value) {
    const match = String(value || '').match(/^data:(image\/[a-z0-9.+-]+)(?:;[^,]*)?,/i);
    return normalizeMimeType(match?.[1]);
  }

  function mimeFromBase64(value) {
    const raw = String(value || '').trim().replace(/^data:[^,]+,/i, '').replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    if (raw.length < 8 || !/^[A-Za-z0-9+/=]+$/.test(raw)) return '';
    try {
      const encoded = raw.slice(0, 64).padEnd(Math.ceil(raw.slice(0, 64).length / 4) * 4, '=');
      const decoded = typeof atob === 'function' ? atob(encoded) : '';
      const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
      if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
      if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
      if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
      if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) return 'image/gif';
    } catch {
      return '';
    }
    return '';
  }

  function isLikelyRawImageBase64(value) {
    const raw = String(value || '').trim().replace(/\s+/g, '');
    if (raw.length < 16 || raw.length % 4 !== 0 || !/^[A-Za-z0-9+/_=-]+$/.test(raw)) return false;
    return raw.includes('=') || !!mimeFromBase64(raw);
  }

  function candidateFromObject(payload, object, fallbackIndex = 0) {
    const rawImage = firstValue(object?.image, object?.image_data, object?.imageData, object?.image_bytes, object?.imageBytes);
    let b64 = firstValue(object?.b64_json, object?.b64Json, object?.base64, object?.base64_image, object?.base64Image, object?.image_base64, object?.imageBase64);
    const dataUrl = firstValue(object?.data_url, object?.dataUrl, object?.image_data_url, object?.imageDataUrl);
    const url = firstValue(object?.url, object?.image_url, object?.imageUrl, object?.uri, object?.src, object?.href, object?.download_url, object?.downloadUrl);
    if (!b64 && !dataUrl && !url && typeof rawImage === 'string') {
      if (/^data:image\//i.test(rawImage) || /^https?:\/\//i.test(rawImage)) {
        return candidateFromString(payload, rawImage, 'image', fallbackIndex);
      }
      if (isLikelyRawImageBase64(rawImage)) b64 = rawImage;
    }
    if (!b64 && !dataUrl && !url) return null;
    const outputIndex = Number(firstValue(
      object?.output_index,
      object?.outputIndex,
      object?.image_index,
      object?.imageIndex,
      object?.request_index,
      object?.requestIndex,
      payload?.output_index,
      payload?.outputIndex,
      payload?.image_index,
      payload?.imageIndex,
      payload?.request_index,
      payload?.requestIndex,
      fallbackIndex
    ));
    const partialIndexRaw = firstValue(
      object?.partial_image_index,
      object?.partialImageIndex,
      payload?.partial_image_index,
      payload?.partialImageIndex
    );
    const outputFormat = firstValue(
      object?.output_format,
      object?.outputFormat,
      object?.format,
      payload?.output_format,
      payload?.outputFormat,
      payload?.format
    );
    const explicitMimeType = normalizeMimeType(firstValue(
      object?.mime_type,
      object?.mimeType,
      object?.content_type,
      object?.contentType,
      payload?.mime_type,
      payload?.mimeType,
      payload?.content_type,
      payload?.contentType
    ));
    const mimeType = explicitMimeType
      || mimeFromDataUrl(dataUrl)
      || mimeFromDataUrl(b64)
      || mimeFromBase64(b64)
      || normalizeMimeType(outputFormat);
    return {
      b64_json: b64 ? String(b64).replace(/^data:image\/[^;]+;base64,/i, '') : undefined,
      data_url: dataUrl ? String(dataUrl) : undefined,
      url: url ? String(url) : undefined,
      output_index: Number.isFinite(outputIndex) ? outputIndex : fallbackIndex,
      outputIndex: Number.isFinite(outputIndex) ? outputIndex : fallbackIndex,
      partialIndex: Number.isFinite(Number(partialIndexRaw)) ? Number(partialIndexRaw) : undefined,
      eventType: eventType(payload),
      receivedAt: Date.now(),
      quality: firstValue(object?.quality, payload?.quality),
      size: firstValue(object?.size, payload?.size),
      output_format: outputFormat,
      mime_type: mimeType || undefined,
      revised_prompt: firstValue(object?.revised_prompt, payload?.revised_prompt)
    };
  }

  function candidateFromString(payload, value, key = '', fallbackIndex = 0) {
    const text = String(value || '').trim();
    if (!text) return null;
    const normalizedKey = String(key || '').replace(/[-\s]/g, '_').toLowerCase();
    const dataUrl = /^data:image\//i.test(text);
    const url = /^https?:\/\//i.test(text);
    const imageKey = isImageCandidateKey(normalizedKey);
    const b64 = !dataUrl && !url && imageKey && /^[A-Za-z0-9+/_=-]{16,}$/.test(text) ? text : '';
    if (!dataUrl && !url && !b64) return null;
    return candidateFromObject(payload, dataUrl ? { data_url: text } : url ? { url: text } : { b64_json: text }, fallbackIndex);
  }

  function collectEventCandidates(payload, scanOptions = {}) {
    const candidates = [];
    const seen = new Set();
    const seenObjects = new Set();
    const stack = [{ value: payload, key: '', depth: 0 }];
    const scanDepth = Math.max(1, Math.min(32, Number(scanOptions.scanDepth) || DEFAULT_SCAN_DEPTH));
    const scanNodes = Math.max(100, Math.min(100000, Number(scanOptions.scanNodes) || DEFAULT_SCAN_NODES));
    let scannedNodes = 0;
    while (stack.length) {
      const entry = stack.pop();
      const value = entry?.value;
      const key = entry?.key || '';
      const depth = Number(entry?.depth) || 0;
      if (value === null || value === undefined || depth > scanDepth) continue;
      scannedNodes += 1;
      if (scannedNodes > scanNodes) break;
      if (typeof value === 'string') {
        const candidate = candidateFromString(payload, value, key, candidates.length);
        if (candidate) {
          const dedupeValue = candidate.b64_json || candidate.data_url || candidate.url;
          const dedupeKey = `${candidate.outputIndex}:${dedupeValue}`;
          if (!seen.has(dedupeKey)) {
            seen.add(dedupeKey);
            candidates.push(candidate);
          }
        }
        continue;
      }
      if (typeof value !== 'object' || seenObjects.has(value)) continue;
      seenObjects.add(value);
      const candidate = candidateFromObject(payload, value, candidates.length);
      if (candidate) {
        const dedupeValue = candidate.b64_json || candidate.data_url || candidate.url;
        const dedupeKey = `${candidate.outputIndex}:${dedupeValue}`;
        if (!seen.has(dedupeKey)) {
          seen.add(dedupeKey);
          candidates.push(candidate);
        }
      }
      if (Array.isArray(value)) {
        for (let index = value.length - 1; index >= 0; index -= 1) {
          stack.push({ value: value[index], key, depth: depth + 1 });
        }
        continue;
      }
      const entries = Object.entries(value);
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const [childKey, child] = entries[index];
        if (candidate && isImageCandidateKey(childKey)) continue;
        stack.push({ value: child, key: childKey, depth: depth + 1 });
      }
    }
    return candidates;
  }

  function createStreamError(message, code, stage, context = {}) {
    const error = new Error(message);
    error.code = code;
    error.stage = stage;
    Object.assign(error, context);
    return error;
  }

  function compactMetadata(payload, candidateCount) {
    const dataCount = Array.isArray(payload?.data) ? payload.data.length : undefined;
    return {
      type: eventType(payload).slice(0, 80),
      status: String(payload?.status || payload?.response?.status || '').slice(0, 40),
      id: String(payload?.id || payload?.response?.id || '').slice(0, 120),
      candidateCount,
      outputIndex: firstValue(payload?.output_index, payload?.outputIndex, payload?.image_index, payload?.imageIndex, null),
      keys: Object.keys(payload || {}).filter((key) => !/(?:b64|base64|image_data)/i.test(key)).slice(0, 12),
      dataCount,
      hasError: Boolean(payload?.error || payload?.response?.error)
    };
  }

  async function consumeImageStream(response, options = {}) {
    const reader = response?.body?.getReader?.();
    if (!reader) throw createStreamError('流式响应不可读取', 'IMAGE_STREAM_UNREADABLE', 'stream-open');
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const eventLimit = Number(options.eventLimit) || DEFAULT_EVENT_LIMIT;
    const outputLimit = Number(options.outputLimit) || DEFAULT_OUTPUT_LIMIT;
    const metadataLimit = Number(options.metadataLimit) || DEFAULT_METADATA_LIMIT;
    const candidatesByOutput = new Map();
    const terminalCandidatesByOutput = new Map();
    const streamEvents = [];
    let buffer = '';
    let eventCount = 0;
    let partialCount = 0;
    let terminalSuccess = false;
    let completionReason = 'connection-closed';

    const partialCandidates = () => [...candidatesByOutput.values()].sort((a, b) => a.outputIndex - b.outputIndex);
    const terminalCandidates = () => [...terminalCandidatesByOutput.values()].sort((a, b) => a.outputIndex - b.outputIndex);
    const context = () => ({
      partialCandidates: partialCandidates(),
      streamEvents: [...streamEvents],
      streamEventCount: eventCount,
      partialCount,
      lastStreamEventType: streamEvents.at(-1)?.type || '',
      completionReason
    });

    const acceptCandidates = (payload, candidates) => {
      const type = eventType(payload);
      const isTerminal = isImageTerminalEventType(type)
        || ['completed', 'succeeded'].includes(String(payload?.status || payload?.response?.status || '').toLowerCase());
      const isPartial = !isTerminal && (isImagePartialEventType(type) && candidates.length > 0);
      for (const candidate of candidates) {
        const target = isTerminal ? terminalCandidatesByOutput : candidatesByOutput;
        if (target.size >= outputLimit && !target.has(candidate.outputIndex)) continue;
        target.set(candidate.outputIndex, candidate);
        if (isPartial) {
          partialCount += 1;
          try {
            options.onPartialImage?.(candidate);
          } catch (error) {
            throw createStreamError(
              `流式预览回调失败：${error?.message || '未知错误'}`,
              'IMAGE_STREAM_PARTIAL_CALLBACK_FAILED',
              'partial-callback',
              context()
            );
          }
        }
      }
    };

    const handlePayload = (payload) => {
      eventCount += 1;
      const candidates = collectEventCandidates(payload, options);
      streamEvents.push(compactMetadata(payload, candidates.length));
      if (streamEvents.length > metadataLimit) streamEvents.shift();
      acceptCandidates(payload, candidates);
      const failure = eventErrorMessage(payload);
      if (failure) {
        throw createStreamError(failure, 'IMAGE_STREAM_UPSTREAM_FAILED', 'stream-event', context());
      }
      const type = eventType(payload);
      const status = String(payload?.status || payload?.response?.status || '').toLowerCase();
      const resultObject = isImageResultEventType(type);
      if (resultObject) {
        terminalSuccess = true;
        completionReason = candidates.length
          ? 'result-object'
          : candidatesByOutput.size
            ? 'last-partial-fallback'
            : 'result-empty';
      } else if (isImageTerminalEventType(type) || status === 'completed' || status === 'succeeded') {
        terminalSuccess = true;
        completionReason = candidates.length ? 'completed-event' : candidatesByOutput.size ? 'last-partial-fallback' : 'completed-empty';
      }
    };

    const handleBlock = (block) => {
      const dataLines = parseSseDataLines(block);
      const eventName = parseSseEventName(block);
      const doneSignal = dataLines.some((line) => /^\s*\[DONE\]\s*$/i.test(line));
      const jsonLines = dataLines.filter((line) => line.trim() && !/^\s*\[DONE\]\s*$/i.test(line));
      if (jsonLines.length) {
        const data = jsonLines.join('\n').trim();
        let payload;
        try {
          payload = JSON.parse(data);
        } catch {
          throw createStreamError('图片流包含无法解析的 SSE 数据', 'IMAGE_STREAM_INVALID_EVENT', 'stream-parse', {
            detail: data.slice(0, 1000),
            ...context()
          });
        }
        if (eventName && payload && typeof payload === 'object' && !Array.isArray(payload)) {
          payload = {
            ...payload,
            ...(payload.upstream_event_type || payload.upstreamEventType || payload.type || payload.event
              ? { upstream_event_type: payload.upstream_event_type || payload.upstreamEventType || eventName }
              : { type: eventName })
          };
        }
        handlePayload(payload);
      }
      if (doneSignal && !terminalSuccess) {
        terminalSuccess = true;
        completionReason = terminalCandidatesByOutput.size
          ? 'done-after-result'
          : candidatesByOutput.size
            ? 'last-partial-fallback'
            : 'done-empty';
      }
    };

    const drain = () => {
      let match = buffer.match(/\r?\n\r?\n/);
      while (match) {
        const index = match.index || 0;
        const block = buffer.slice(0, index);
        if (encoder.encode(block).byteLength > eventLimit) {
          throw createStreamError('流式图片事件超过安全上限', 'IMAGE_STREAM_EVENT_TOO_LARGE', 'stream-parse', context());
        }
        buffer = buffer.slice(index + match[0].length);
        handleBlock(block);
        if (terminalSuccess) break;
        match = buffer.match(/\r?\n\r?\n/);
      }
      if (encoder.encode(buffer).byteLength > eventLimit) {
        throw createStreamError('流式图片事件超过安全上限', 'IMAGE_STREAM_EVENT_TOO_LARGE', 'stream-parse', context());
      }
    };

    try {
      while (!terminalSuccess) {
        let packet;
        try {
          packet = await reader.read();
        } catch (error) {
          throw createStreamError(error?.message || '图片流连接中断', 'IMAGE_STREAM_TRANSPORT_INTERRUPTED', 'stream-transport', {
            cause: error,
            ...context()
          });
        }
        if (packet.done) break;
        if (Number(packet.value?.byteLength || 0) > eventLimit) {
          throw createStreamError('流式图片数据块超过安全上限', 'IMAGE_STREAM_CHUNK_TOO_LARGE', 'stream-parse', context());
        }
        buffer += decoder.decode(packet.value, { stream: true });
        drain();
      }
      if (terminalSuccess) await reader.cancel?.().catch?.(() => {});
      if (!terminalSuccess) {
        buffer += decoder.decode();
        if (buffer.trim()) handleBlock(buffer);
      }
    } catch (error) {
      await reader.cancel?.().catch?.(() => {});
      const normalizedError = error instanceof Error
        ? error
        : createStreamError(String(error || '图片流处理失败'), 'IMAGE_STREAM_FAILED', 'stream-transport');
      Object.assign(normalizedError, context());
      throw normalizedError;
    }

    const data = terminalCandidates().length ? terminalCandidates() : partialCandidates();
    if (data.length && terminalSuccess) {
      return {
        data,
        streamEvents,
        streamEventCount: eventCount,
        partialCount,
        lastStreamEventType: streamEvents.at(-1)?.type || '',
        streamed: true,
        completionReason
      };
    }
    if (data.length) {
      throw createStreamError(
        '图片流在最终完成事件前结束，已保留收到的预览图。',
        'IMAGE_STREAM_TRANSPORT_INTERRUPTED',
        'stream-disconnect',
        context()
      );
    }
    if (terminalSuccess) {
      throw createStreamError('图片流已结束，但最终事件没有包含可解析图片', 'IMAGE_STREAM_EMPTY_COMPLETION', 'stream-complete', context());
    }
    throw createStreamError('图片流连接已结束，但没有返回可解析图片', 'IMAGE_STREAM_NO_IMAGE', 'stream-disconnect', context());
  }

  function defaultEditImageField() {
    return 'image[]';
  }

  function shouldRetryEditImageField(details = {}) {
    const status = Number(details.status || 0);
    if (status < 400 || status >= 500) return false;
    if (Number(details.streamEventCount || 0) > 0 || Number(details.partialCount || 0) > 0) return false;
    return /(?:unknown|invalid|unexpected|missing|unsupported).{0,40}(?:image\[\]|image)|(?:image\[\]|image).{0,40}(?:field|parameter|required)/i.test(String(details.message || details.detail || ''));
  }

  return {
    classifyImageResponse,
    consumeImageStream,
    defaultEditImageField,
    shouldRetryEditImageField
  };
});
