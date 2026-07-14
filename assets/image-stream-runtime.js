(function initImageStreamRuntime(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.NexGenImageStream = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createImageStreamRuntime() {
  const DEFAULT_EVENT_LIMIT = 32 * 1024 * 1024;
  const DEFAULT_OUTPUT_LIMIT = 16;
  const DEFAULT_METADATA_LIMIT = 24;
  const DEFAULT_SCAN_DEPTH = 12;
  const DEFAULT_SCAN_NODES = 20000;

  function firstValue(...values) {
    return values.find((value) => value !== undefined && value !== null && value !== '');
  }

  function classifyImageResponse(contentType, prefix = '') {
    const type = String(contentType || '').toLowerCase();
    const head = String(prefix || '').slice(0, 8192);
    if (type.includes('text/event-stream')) return 'sse';
    if (/^\s*(?:data|event)\s*:/i.test(head)) return 'sse-sniffed';
    if (type.includes('json')) return head ? 'json' : 'undetermined';
    return head ? 'json' : 'undetermined';
  }

  function parseSseDataBlock(block) {
    const dataLines = String(block || '')
      .split(/\r?\n/)
      .filter((line) => /^\s*data\s*:/i.test(line))
      .map((line) => line.replace(/^\s*data\s*:\s?/i, ''));
    return dataLines.join('\n').trim();
  }

  function eventType(payload) {
    return String(firstValue(payload?.type, payload?.event, payload?.object) || '').toLowerCase();
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

  function candidateFromObject(payload, object, fallbackIndex = 0) {
    const rawImage = firstValue(object?.image, object?.image_data, object?.imageData, object?.image_bytes, object?.imageBytes);
    let b64 = firstValue(object?.b64_json, object?.b64Json, object?.base64, object?.base64_image, object?.base64Image, object?.image_base64, object?.imageBase64);
    const dataUrl = firstValue(object?.data_url, object?.dataUrl, object?.image_data_url, object?.imageDataUrl);
    const url = firstValue(object?.url, object?.image_url, object?.imageUrl, object?.uri, object?.src, object?.href, object?.download_url, object?.downloadUrl);
    if (!b64 && !dataUrl && !url && typeof rawImage === 'string') {
      if (/^data:image\//i.test(rawImage) || /^https?:\/\//i.test(rawImage)) {
        return candidateFromString(payload, rawImage, 'image', fallbackIndex);
      }
      b64 = rawImage;
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
      output_format: firstValue(object?.output_format, payload?.output_format),
      revised_prompt: firstValue(object?.revised_prompt, payload?.revised_prompt)
    };
  }

  function candidateFromString(payload, value, key = '', fallbackIndex = 0) {
    const text = String(value || '').trim();
    if (!text) return null;
    const normalizedKey = String(key || '').replace(/[-\s]/g, '_').toLowerCase();
    const dataUrl = /^data:image\//i.test(text);
    const url = /^https?:\/\//i.test(text);
    const imageKey = /^(?:b64_json|b64json|base64|base64_image|base64image|image_base64|imagebase64|image_data|imagedata|image_bytes|imagebytes|image|images|data|output|outputs|result|results|data_url|dataurl|image_data_url|imagedataurl|url|image_url|imageurl|uri|src|href)$/.test(normalizedKey);
    const b64 = !dataUrl && !url && imageKey && /^[A-Za-z0-9+/_=-]{4,}$/.test(text) ? text : '';
    if (!dataUrl && !url && !b64) return null;
    return candidateFromObject(payload, dataUrl ? { data_url: text } : url ? { url: text } : { b64_json: text }, fallbackIndex);
  }

  function collectEventCandidates(payload) {
    const candidates = [];
    const seen = new Set();
    const seenValues = new Set();
    const seenObjects = new Set();
    const stack = [{ value: payload, key: '', depth: 0 }];
    let scannedNodes = 0;
    while (stack.length) {
      const entry = stack.pop();
      const value = entry?.value;
      const key = entry?.key || '';
      const depth = Number(entry?.depth) || 0;
      if (value === null || value === undefined || depth > DEFAULT_SCAN_DEPTH) continue;
      scannedNodes += 1;
      if (scannedNodes > DEFAULT_SCAN_NODES) break;
      if (typeof value === 'string') {
        const candidate = candidateFromString(payload, value, key, candidates.length);
        if (candidate) {
          const dedupeValue = candidate.b64_json || candidate.data_url || candidate.url;
          if (seenValues.has(dedupeValue)) continue;
          const dedupeKey = `${candidate.outputIndex}:${dedupeValue}`;
          if (!seen.has(dedupeKey)) {
            seen.add(dedupeKey);
            seenValues.add(dedupeValue);
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
        if (!seen.has(dedupeKey) && !seenValues.has(dedupeValue)) {
          seen.add(dedupeKey);
          seenValues.add(dedupeValue);
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
    const streamEvents = [];
    let buffer = '';
    let eventCount = 0;
    let partialCount = 0;
    let terminalSuccess = false;
    let completionReason = 'connection-closed';

    const partialCandidates = () => [...candidatesByOutput.values()].sort((a, b) => a.outputIndex - b.outputIndex);
    const context = () => ({
      partialCandidates: partialCandidates(),
      streamEvents: [...streamEvents],
      streamEventCount: eventCount,
      partialCount,
      lastStreamEventType: streamEvents.at(-1)?.type || ''
    });

    const acceptCandidates = (payload, candidates) => {
      const type = eventType(payload);
      const isPartial = /partial_image$/.test(type);
      for (const candidate of candidates) {
        if (candidatesByOutput.size >= outputLimit && !candidatesByOutput.has(candidate.outputIndex)) continue;
        candidatesByOutput.set(candidate.outputIndex, candidate);
        if (isPartial) {
          partialCount += 1;
          options.onPartialImage?.(candidate);
        }
      }
    };

    const handleBlock = (block) => {
      const doneSignal = String(block || '').split(/\r?\n/).some((line) => /^\s*data:\s*\[DONE\]\s*$/i.test(line));
      if (doneSignal) {
        terminalSuccess = true;
        completionReason = candidatesByOutput.size ? 'last-partial-fallback' : 'done-empty';
        return;
      }
      const data = parseSseDataBlock(block);
      if (!data) return;
      let payload;
      try {
        payload = JSON.parse(data);
      } catch {
        throw createStreamError('图片流包含无法解析的 SSE 数据', 'IMAGE_STREAM_INVALID_EVENT', 'stream-parse', {
          detail: data.slice(0, 1000),
          ...context()
        });
      }
      eventCount += 1;
      const candidates = collectEventCandidates(payload);
      streamEvents.push(compactMetadata(payload, candidates.length));
      if (streamEvents.length > metadataLimit) streamEvents.shift();
      acceptCandidates(payload, candidates);
      const failure = eventErrorMessage(payload);
      if (failure) {
        throw createStreamError(failure, 'IMAGE_STREAM_UPSTREAM_FAILED', 'stream-event', context());
      }
      const type = eventType(payload);
      const status = String(payload?.status || payload?.response?.status || '').toLowerCase();
      const resultObject = type === 'image.edit.result' || type === 'image.generation.result';
      if (resultObject && candidates.length) {
        terminalSuccess = true;
        completionReason = 'result-object';
      } else if (/(?:image_edit|image_generation|response)\.(?:completed|done)$/.test(type) || status === 'completed' || status === 'succeeded') {
        terminalSuccess = true;
        completionReason = candidates.length ? 'completed-event' : candidatesByOutput.size ? 'last-partial-fallback' : 'completed-empty';
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
      if (!error.partialCandidates) Object.assign(error, context());
      throw error;
    }

    const data = partialCandidates();
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
