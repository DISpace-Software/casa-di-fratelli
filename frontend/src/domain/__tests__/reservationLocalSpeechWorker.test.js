import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../reservations/reservationLocalSpeech.worker.js', import.meta.url), 'utf8');
const origin = 'https://admin.example.test';
const assetBase = `${origin}/speech/bg-zipformer/8d2f8f4-sherpa-1.12.36/`;
const sizes = new Map([
  ['encoder-epoch-40-avg-8.int8.onnx', 72828389],
  ['decoder-epoch-40-avg-8.int8.onnx', 540689],
  ['joiner-epoch-40-avg-8.int8.onnx', 259417],
  ['tokens.txt', 7119],
  ['sherpa-runtime.wasm', 11872164],
]);

function workerHarness({ wrongSize = 0, cachedFiles = null, storageFails = false } = {}) {
  const messages = [], requests = [], imports = [], written = [], unlinked = [];
  let storageAccesses = 0, persistenceRequests = 0, cloneCalls = 0, activeStreams = 0, maxStreams = 0, cancellations = 0, maxCachedChunk = 0, cacheWrites = 0;
  function response(file) {
    let remaining = sizes.get(file) + wrongSize;
    activeStreams++; maxStreams = Math.max(maxStreams, activeStreams);
    return {
      ok: true, headers: new Headers({ 'Content-Type': file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream' }),
      clone() { cloneCalls++; throw new Error('Do not retain a second model buffer'); },
      body: { getReader: () => ({
        async read() {
          if (remaining === 0) return { done: true };
          const length = Math.min(64 * 1024, remaining);
          remaining -= length;
          return { done: false, value: new Uint8Array(length) };
        },
        async cancel() { cancellations++; remaining = 0; },
        releaseLock() { activeStreams--; },
      }) },
    };
  }
  const cache = {
    async match(url) { return cachedFiles.has(url) ? response(new URL(url).pathname.split('/').at(-1)) : undefined; },
    async put(url, value) {
      if (storageFails) throw new Error('Quota exceeded');
      cacheWrites++;
      let bytes = 0;
      const reader = value.body.getReader();
      for (;;) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        bytes += chunk.byteLength;
        maxCachedChunk = Math.max(maxCachedChunk, chunk.byteLength);
      }
      assert.equal(bytes, sizes.get(new URL(url).pathname.split('/').at(-1)));
      assert.equal(value.headers.get('Content-Length'), String(bytes));
      cachedFiles.set(url, bytes);
    },
  };
  const scope = {
    location: { origin }, postMessage: value => messages.push(value),
    reservationSherpaFS: {
      writeFile: (name, bytes) => written.push([name, bytes.byteLength]),
      unlink: name => unlinked.push(name),
    },
    ReservationSherpaOfflineRecognizer: class { constructor() { this.handle = 1; } },
  };
  Object.defineProperty(scope, 'caches', { get() {
    storageAccesses++;
    if (!cachedFiles) throw new Error('Storage quota unavailable');
    return { open: async () => cache };
  } });
  const context = vm.createContext({
    self: scope, URL, Uint8Array, Float32Array, ReadableStream, Response,
    navigator: { get storage() { persistenceRequests++; throw new Error('No storage permission'); } },
    fetch: async (url, options) => {
      requests.push({ url, ...options });
      const file = new URL(url).pathname.split('/').at(-1);
      assert.ok(sizes.has(file), 'Only pinned model assets can be fetched');
      return response(file);
    },
    importScripts: (...urls) => {
      imports.push(...urls);
      for (const callback of scope.Module.preRun) callback();
      scope.Module.onRuntimeInitialized();
    },
  });
  vm.runInContext(source, context);
  return {
    messages, requests, imports, written, unlinked,
    counts: () => ({ storageAccesses, persistenceRequests, cloneCalls, activeStreams, maxStreams, cancellations, maxCachedChunk, cacheWrites }),
    prepare: (base = assetBase) => scope.onmessage({ data: { id: messages.length + 1, type: 'prepare', assetBase: base } }),
  };
}

test('worker loads pinned files when browser storage is unavailable without permission requests or cloned model buffers', async () => {
  const worker = workerHarness();
  await worker.prepare();
  assert.equal(worker.messages.at(-1).type, 'ready');
  assert.equal(worker.requests.length, sizes.size);
  for (const request of worker.requests) {
    assert.equal(new URL(request.url).origin, origin);
    assert.equal(request.credentials, 'omit');
    assert.equal(request.mode, 'same-origin');
    assert.equal(request.cache, 'force-cache');
    assert.equal(request.redirect, 'error');
  }
  assert.deepEqual(worker.counts(), { storageAccesses: 1, persistenceRequests: 0, cloneCalls: 0, activeStreams: 0, maxStreams: 1, cancellations: 0, maxCachedChunk: 0, cacheWrites: 0 });
  assert.deepEqual(worker.written.map(([name]) => name), worker.unlinked);
  assert.equal(worker.written.reduce((total, [, bytes]) => total + bytes, 0), 73635614);
  assert.deepEqual(worker.imports, [assetBase + 'sherpa-runtime.js', assetBase + 'sherpa-asr.js']);
  await worker.prepare();
  assert.equal(worker.messages.at(-1).type, 'ready');
  assert.equal(worker.requests.length, sizes.size, 'A live recognizer must not fetch model files again');
});

test('validated model bytes are cached in bounded chunks and reused by a replacement worker', async () => {
  const cachedFiles = new Map();
  const cold = workerHarness({ cachedFiles });
  await cold.prepare();
  assert.equal(cold.messages.at(-1).type, 'ready');
  assert.equal(cold.requests.length, sizes.size);
  assert.equal(cold.counts().cacheWrites, sizes.size);
  assert.equal(cold.counts().maxCachedChunk, 64 * 1024);
  assert.equal(cold.counts().cloneCalls, 0);
  assert.equal(cold.counts().persistenceRequests, 0);
  const warm = workerHarness({ cachedFiles });
  await warm.prepare();
  assert.equal(warm.messages.at(-1).type, 'ready');
  assert.deepEqual(warm.requests, []);
  assert.equal(warm.counts().cacheWrites, 0);
});

test('model cache quota failure does not interrupt preparation or retry downloads', async () => {
  const worker = workerHarness({ cachedFiles: new Map(), storageFails: true });
  await worker.prepare();
  assert.equal(worker.messages.at(-1).type, 'ready');
  assert.equal(worker.requests.length, sizes.size);
  assert.equal(worker.counts().persistenceRequests, 0);
  assert.equal(worker.counts().cloneCalls, 0);
});

test('worker refuses an oversized asset and cancels its stream before loading runtime', async () => {
  const worker = workerHarness({ wrongSize: 1 });
  await worker.prepare();
  assert.equal(worker.messages.at(-1).type, 'error');
  assert.equal(worker.messages.at(-1).code, 'local-model-load');
  assert.equal(worker.requests.length, 1);
  assert.deepEqual(worker.imports, []);
  assert.equal(worker.counts().cancellations, 1);
  assert.equal(worker.counts().activeStreams, 0);
});

test('worker rejects unpinned or cross-origin asset bases before any fetch or storage access', async () => {
  for (const base of ['https://external.example.test/speech/bg-zipformer/8d2f8f4-sherpa-1.12.36/', `${origin}/other/`, assetBase + '?remote=1', assetBase + '#fragment']) {
    const worker = workerHarness();
    await worker.prepare(base);
    assert.equal(worker.messages.at(-1).code, 'local-model-load');
    assert.deepEqual(worker.requests, []);
    assert.deepEqual(worker.imports, []);
    assert.equal(worker.counts().storageAccesses, 0);
  }
});
