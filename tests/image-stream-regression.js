const assert = require('assert');
const path = require('path');

const runtimePath = path.resolve(__dirname, '..', 'assets', 'image-stream-runtime.js');

function sseEvent(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function streamResponse(chunks, options = {}) {
  const encoder = new TextEncoder();
  let index = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        const chunk = chunks[index++];
        if (chunk instanceof Error) {
          controller.error(chunk);
          return;
        }
        controller.enqueue(encoder.encode(chunk));
        return;
      }
      if (options.keepOpen) return new Promise(() => {});
      controller.close();
    }
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': options.contentType || 'text/event-stream' }
  });
}

(async () => {
  const runtime = require(runtimePath);
  assert.strictEqual(typeof runtime.consumeImageStream, 'function');
  assert.strictEqual(typeof runtime.classifyImageResponse, 'function');

  const partials = [];
  const disconnectResponse = streamResponse([
    sseEvent({
      type: 'image_edit.partial_image',
      b64_json: 'cHJldmlldy0x',
      output_index: 0,
      partial_image_index: 0
    }),
    new Error('socket closed')
  ]);
  let disconnectError;
  try {
    await runtime.consumeImageStream(disconnectResponse, {
      onPartialImage: (partial) => partials.push(partial)
    });
  } catch (error) {
    disconnectError = error;
  }
  assert(disconnectError, 'partial followed by disconnect must reject');
  assert.strictEqual(disconnectError.code, 'IMAGE_STREAM_TRANSPORT_INTERRUPTED');
  assert.strictEqual(disconnectError.stage, 'stream-transport');
  assert.strictEqual(disconnectError.partialCandidates.length, 1);
  assert.strictEqual(disconnectError.partialCandidates[0].outputIndex, 0);
  assert.strictEqual(partials.length, 1);

  const stackTransportChunks = Array.from({ length: 25 }, (_, index) => sseEvent({
    type: 'image.generation.chunk',
    progress_text: 'working',
    index
  }));
  stackTransportChunks.push(new RangeError('Maximum call stack size exceeded'));
  let stackTransportError;
  try {
    await runtime.consumeImageStream(streamResponse(stackTransportChunks));
  } catch (error) {
    stackTransportError = error;
  }
  assert(stackTransportError, 'transport RangeError after progress events must be surfaced as a stream error');
  assert.strictEqual(stackTransportError.code, 'IMAGE_STREAM_TRANSPORT_INTERRUPTED');
  assert.strictEqual(stackTransportError.stage, 'stream-transport');
  assert.strictEqual(stackTransportError.streamEventCount, 25);
  assert.match(stackTransportError.message, /Maximum call stack size exceeded/);

  let partialCallbackError;
  try {
    await runtime.consumeImageStream(streamResponse([
      sseEvent({
        type: 'image_generation.partial_image',
        b64_json: 'Y2FsbGJhY2stZXJyb3I=',
        output_index: 0,
        partial_image_index: 0
      })
    ]), {
      onPartialImage: () => {
        throw new RangeError('Maximum call stack size exceeded');
      }
    });
  } catch (error) {
    partialCallbackError = error;
  }
  assert(partialCallbackError, 'preview callback RangeError must be classified separately from transport failure');
  assert.strictEqual(partialCallbackError.code, 'IMAGE_STREAM_PARTIAL_CALLBACK_FAILED');
  assert.strictEqual(partialCallbackError.stage, 'partial-callback');
  assert.match(partialCallbackError.message, /流式预览回调失败/);

  const cleanCloseResponse = streamResponse([
    sseEvent({
      type: 'image_generation.partial_image',
      b64_json: 'Y2xlYW4tY2xvc2UtcHJldmlldw==',
      output_index: 0,
      partial_image_index: 0
    })
  ]);
  let cleanCloseError;
  try {
    await runtime.consumeImageStream(cleanCloseResponse);
  } catch (error) {
    cleanCloseError = error;
  }
  assert(cleanCloseError, 'partial followed by a clean close without a terminal event must reject');
  assert.strictEqual(cleanCloseError.code, 'IMAGE_STREAM_TRANSPORT_INTERRUPTED');
  assert.strictEqual(cleanCloseError.stage, 'stream-disconnect');
  assert.strictEqual(cleanCloseError.partialCandidates.length, 1);

  const failedResponse = streamResponse([
    sseEvent({
      type: 'image_generation.partial_image',
      b64_json: 'cHJldmlldy0y',
      output_index: 1,
      partial_image_index: 2
    }),
    sseEvent({
      type: 'image_generation.failed',
      error: { message: 'upstream rejected image' }
    })
  ]);
  let failedError;
  try {
    await runtime.consumeImageStream(failedResponse);
  } catch (error) {
    failedError = error;
  }
  assert(failedError, 'failed event must reject');
  assert.strictEqual(failedError.code, 'IMAGE_STREAM_UPSTREAM_FAILED');
  assert.strictEqual(failedError.partialCandidates.length, 1);
  assert.strictEqual(failedError.partialCandidates[0].outputIndex, 1);

  const untypedErrorResponse = streamResponse([
    sseEvent({
      error: { message: 'gateway rejected stream parameters' }
    }),
    'data: [DONE]\n\n'
  ]);
  let untypedError;
  try {
    await runtime.consumeImageStream(untypedErrorResponse);
  } catch (error) {
    untypedError = error;
  }
  assert(untypedError, 'untyped SSE error objects must reject');
  assert.strictEqual(untypedError.code, 'IMAGE_STREAM_UPSTREAM_FAILED');
  assert.match(untypedError.message, /gateway rejected stream parameters/);
  assert.strictEqual(untypedError.lastStreamEventType, '');
  assert.deepStrictEqual(untypedError.streamEvents[0].keys, ['error']);
  assert.strictEqual(untypedError.streamEvents[0].hasError, true);

  const resultObject = await runtime.consumeImageStream(streamResponse([
    sseEvent({
      object: 'image.edit.result',
      data: [{
        b64_json: 'cmVzdWx0LW9iamVjdA==',
        output_format: 'png',
        size: '1024x1536'
      }]
    })
  ], { keepOpen: true }));
  assert.strictEqual(resultObject.completionReason, 'result-object');
  assert.strictEqual(resultObject.data.length, 1);
  assert.strictEqual(resultObject.data[0].b64_json, 'cmVzdWx0LW9iamVjdA==');

  const cookSleepPartials = [];
  const cookSleepResult = await runtime.consumeImageStream(streamResponse([
    sseEvent({
      object: 'image.generation.chunk',
      created: 1779551054,
      model: 'gpt-image-2',
      data: [{
        b64_json: 'cHJldmlldy1jaHVuaw==',
        output_format: 'jpeg'
      }]
    }),
    sseEvent({
      object: 'image.generation.result',
      created: 1779551140,
      model: 'gpt-image-2',
      data: [{
        b64_json: 'ZmluYWwtY29va3NsZWVw',
        revised_prompt: 'rewritten',
        output_format: 'jpeg'
      }],
      size: '1024x1536',
      quality: 'medium',
      output_format: 'jpeg'
    })
  ], { keepOpen: true }), {
    onPartialImage: (partial) => cookSleepPartials.push(partial)
  });
  assert.strictEqual(cookSleepPartials.length, 1, 'image.generation.chunk with image data should be exposed as a preview');
  assert.strictEqual(cookSleepResult.completionReason, 'result-object');
  assert.strictEqual(cookSleepResult.data[0].b64_json, 'ZmluYWwtY29va3NsZWVw');
  assert.strictEqual(cookSleepResult.data[0].mime_type, 'image/jpeg');

  const stringContainerResult = await runtime.consumeImageStream(streamResponse([
    sseEvent({
      type: 'image_generation.completed',
      images: ['data:image/png;base64,AAAA']
    })
  ], { keepOpen: true }));
  assert.strictEqual(stringContainerResult.completionReason, 'completed-event');
  assert.strictEqual(stringContainerResult.data.length, 1);
  assert.strictEqual(stringContainerResult.data[0].data_url, 'data:image/png;base64,AAAA');

  const compatibilityFieldResult = await runtime.consumeImageStream(streamResponse([
    sseEvent({
      type: 'image_generation.completed',
      image: 'Y29tcGF0aWJpbGl0eS1pbWFnZQ=='
    })
  ], { keepOpen: true }));
  assert.strictEqual(compatibilityFieldResult.data.length, 1);
  assert.strictEqual(compatibilityFieldResult.data[0].b64_json, 'Y29tcGF0aWJpbGl0eS1pbWFnZQ==');

  const deepProgressEvent = { type: 'image.generation.chunk', progress_text: 'working' };
  let deepCursor = deepProgressEvent;
  for (let index = 0; index < 12000; index += 1) {
    deepCursor.data = {};
    deepCursor = deepCursor.data;
  }
  deepCursor.progress_text = 'still working';
  let deepProgressError;
  try {
    await runtime.consumeImageStream(streamResponse([sseEvent(deepProgressEvent)]));
  } catch (error) {
    deepProgressError = error;
  }
  assert(deepProgressError, 'deep progress payload without an image should finish with a controlled stream error');
  assert.strictEqual(deepProgressError.code, 'IMAGE_STREAM_NO_IMAGE');
  assert.notStrictEqual(deepProgressError.message, 'Maximum call stack size exceeded');

  const completedResponse = streamResponse([
    sseEvent({
      type: 'image_edit.completed',
      b64_json: 'ZmluYWwtaW1hZ2U=',
      output_index: 0,
      quality: 'high'
    })
  ], { keepOpen: true });
  const completed = await Promise.race([
    runtime.consumeImageStream(completedResponse),
    new Promise((_, reject) => setTimeout(() => reject(new Error('completed stream did not stop')), 250))
  ]);
  assert.strictEqual(completed.completionReason, 'completed-event');
  assert.strictEqual(completed.data.length, 1);
  assert.strictEqual(completed.data[0].b64_json, 'ZmluYWwtaW1hZ2U=');

  const multiOutput = await runtime.consumeImageStream(streamResponse([
    sseEvent({
      type: 'image_generation.partial_image',
      b64_json: 'b3V0LTA=',
      output_index: 0,
      partial_image_index: 0
    }),
    sseEvent({
      type: 'image_generation.partial_image',
      b64_json: 'b3V0LTE=',
      output_index: 1,
      partial_image_index: 0
    }),
    'data: [DONE]\n\n'
  ]));
  assert.deepStrictEqual(
    multiOutput.data.map((item) => item.output_index),
    [0, 1],
    'multi-output previews must remain in separate slots'
  );
  assert.strictEqual(multiOutput.completionReason, 'last-partial-fallback');

  assert.strictEqual(
    runtime.classifyImageResponse('application/json', 'data: {"type":"image_edit.partial_image"}\n\n'),
    'sse-sniffed'
  );

  console.log('[image-stream-regression] stream recovery scenarios passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
