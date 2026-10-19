'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Writable } = require('node:stream');
const { createMediaRelay } = require('../lib/media-relay');
const { createServer } = require('../server');

const stream = 'https://upos-sz-mirrorcos.bilivideo.com/test.mp4';
async function localServer(t, options = {}) {
  const server = createServer(options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return 'http://127.0.0.1:' + server.address().port;
}
const resolveVideo = async () => ({ video: { id: 'BV1cTp66gEi7', url: 'https://www.bilibili.com/video/BV1cTp66gEi7/?p=1' }, streams: [stream] });

test('resolve returns opaque playback URL and advertises local capability', async t => {
  const base = await localServer(t, { resolveVideo });
  const health = await (await fetch(base + '/api/health')).json();
  assert.equal(health.capabilities.bilibiliResolve, true);
  const data = await (await fetch(base + '/api/resolve?url=BV1cTp66gEi7')).json();
  assert.equal(data.ok, true);
  assert.match(data.playUrl, /^\/api\/stream\?token=[a-f0-9]{64}$/);
  assert.ok(data.expiresAt > Date.now());
  assert.equal(JSON.stringify(data).includes('bilivideo.com'), false);
});

test('local parser rejects foreign Origin/Host and unsupported HTTP methods', async t => {
  let calls = 0;
  const base = await localServer(t, { resolveVideo: async () => { calls++; return resolveVideo(); } });
  for (const headers of [{ Origin: 'https://evil.test' }, { Host: 'evil.test' }, { Origin: 'null' }]) {
    // Native fetch rewrites Host, so exercise the actual wire header with http.get.
    const status = await new Promise((resolve, reject) => {
      http.get(base + '/api/resolve?url=anything', { headers }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
    });
    assert.equal(status, 403, JSON.stringify(headers));
  }
  assert.equal((await fetch(base + '/api/resolve', { method: 'POST' })).status, 405);
  assert.equal(calls, 0);
});

test('resolver errors preserve actionable HTTP status and no-store', async t => {
  const base = await localServer(t, { resolveVideo: async () => { throw Object.assign(new Error('B站风控'), { status: 429 }); } });
  const response = await fetch(base + '/api/resolve?url=BV1cTp66gEi7');
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).error, 'B站风控');
});

test('forwards Range bytes, 206 headers and MP4 body without forwarding cookies', async t => {
  let upstream;
  const mediaRelay = createMediaRelay({ fetchImpl: async (url, options) => {
    upstream = { url, options };
    return new Response(Buffer.from('abcd'), { status: 206, headers: { 'content-type': 'video/mp4', 'content-length': '4', 'content-range': 'bytes 0-3/100', 'accept-ranges': 'bytes' } });
  } });
  const base = await localServer(t, { mediaRelay });
  const session = mediaRelay.register([stream]);
  const response = await fetch(base + session.playUrl, { headers: { Range: 'bytes=0-3', Cookie: 'private=never-forward' } });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 0-3/100');
  assert.equal(response.headers.get('accept-ranges'), 'bytes');
  assert.equal(await response.text(), 'abcd');
  assert.equal(upstream.options.headers.Range, 'bytes=0-3');
  assert.equal(upstream.options.headers.Cookie, undefined);
});

test('HEAD returns media headers with no body and forwards unsatisfiable ranges', async t => {
  const mediaRelay = createMediaRelay({ fetchImpl: async (_url, options) => options.method === 'HEAD'
    ? new Response(null, { headers: { 'content-type': 'video/mp4', 'content-length': '100' } })
    : new Response(null, { status: 416, headers: { 'content-range': 'bytes */100' } }) });
  const base = await localServer(t, { mediaRelay });
  const { playUrl } = mediaRelay.register([stream]);
  const head = await fetch(base + playUrl, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), '100');
  assert.equal(await head.text(), '');
  const range = await fetch(base + playUrl, { headers: { Range: 'bytes=999-1000' } });
  assert.equal(range.status, 416);
  assert.equal(range.headers.get('content-range'), 'bytes */100');
});

test('rejects unknown/expired tokens and malformed ranges without fetching', async t => {
  let now = 1000;
  let calls = 0;
  const mediaRelay = createMediaRelay({ now: () => now, ttlMs: 1000, fetchImpl: async () => { calls++; return new Response(''); } });
  const base = await localServer(t, { mediaRelay });
  const { playUrl } = mediaRelay.register([stream]);
  assert.equal((await fetch(base + '/api/stream?token=invalid')).status, 410);
  for (const range of ['bytes=0-1,3-4', 'bytes=-', 'items=1-2']) assert.equal((await fetch(base + playUrl, { headers: { Range: range } })).status, 416);
  now = 2001;
  assert.equal((await fetch(base + playUrl)).status, 410);
  assert.equal(calls, 0);
});

test('register validates stream destinations, bounds sessions and honors CDN deadlines', () => {
  let now = 1000000;
  const relay = createMediaRelay({ now: () => now, maxSessions: 2, ttlMs: 300000 });
  assert.throws(() => relay.register(['http://127.0.0.1/a']), /CDN|播放地址/);
  const expiring = relay.register([stream + '?deadline=1010']);
  assert.ok(expiring.expiresAt <= 1010000);
  assert.throws(() => relay.register([stream + '?deadline=900']), /过期/);
});

test('uses an approved backup on CDN failure and validates every redirect', async t => {
  const calls = [];
  const backup = 'https://other.bilivideo.com/backup.mp4';
  const mediaRelay = createMediaRelay({ fetchImpl: async url => {
    calls.push(String(url));
    if (String(url) === stream) return new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/admin' } });
    return new Response('video', { headers: { 'content-type': 'video/mp4' } });
  } });
  const base = await localServer(t, { mediaRelay });
  const { playUrl } = mediaRelay.register([stream, backup]);
  assert.equal(await (await fetch(base + playUrl)).text(), 'video');
  assert.deepEqual(calls, [stream, backup]);
});

test('does not relay HTML error pages as video', async t => {
  const mediaRelay = createMediaRelay({ fetchImpl: async () => new Response('<html>blocked</html>', { headers: { 'content-type': 'text/html' } }) });
  const base = await localServer(t, { mediaRelay });
  assert.equal((await fetch(base + mediaRelay.register([stream]).playUrl)).status, 502);
});

test('aborts upstream fetch if the browser closes a streaming response', async t => {
  let signal;
  const mediaRelay = createMediaRelay({ fetchImpl: async (_url, options) => {
    signal = options.signal;
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(1024)); } }), { headers: { 'content-type': 'video/mp4' } });
  } });
  const base = await localServer(t, { mediaRelay });
  const response = await fetch(base + mediaRelay.register([stream]).playUrl);
  const reader = response.body.getReader();
  await reader.read();
  await reader.cancel();
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(signal.aborted, true);
});

test('a paused downstream does not trigger the healthy upstream read timeout', async () => {
  let signal;
  let releaseWrite;
  let firstWrite;
  let chunks = 0;
  const started = new Promise(resolve => { firstWrite = resolve; });
  const mediaRelay = createMediaRelay({ timeoutMs: 20, fetchImpl: async (_url, options) => {
    signal = options.signal;
    return new Response(new ReadableStream({ pull(controller) {
      if (chunks++ < 8) controller.enqueue(new Uint8Array(65536));
      else controller.close();
    } }), { headers: { 'content-type': 'video/mp4' } });
  } });
  const response = new Writable({ highWaterMark: 1, write(_chunk, _encoding, callback) {
    if (!releaseWrite) { releaseWrite = callback; firstWrite(); }
    else callback();
  } });
  response.writeHead = () => { response.headersSent = true; };
  const token = new URL(mediaRelay.register([stream]).playUrl, 'http://localhost').searchParams.get('token');
  const serving = mediaRelay.serve({ method: 'GET', headers: {} }, response, token);
  await started;
  await new Promise(resolve => setTimeout(resolve, 60));
  try {
    assert.equal(signal.aborted, false, 'client backpressure must not be treated as a stalled CDN');
    assert.equal(response.destroyed, false);
  } finally {
    releaseWrite();
    await serving;
  }
});

test('a genuinely stalled upstream body still aborts after its read timeout', async () => {
  let signal;
  const relay = createMediaRelay({ timeoutMs: 20, fetchImpl: async (_url, options) => {
    signal = options.signal;
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(16)); } }), { headers: { 'content-type': 'video/mp4' } });
  } });
  const response = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  response.writeHead = () => { response.headersSent = true; };
  const token = new URL(relay.register([stream]).playUrl, 'http://localhost').searchParams.get('token');
  await relay.serve({ method: 'GET', headers: {} }, response, token);
  assert.equal(signal.aborted, true);
  assert.equal(response.destroyed, true);
});

test('old sessions are evicted when the in-memory session limit is reached', async t => {
  const relay = createMediaRelay({ maxSessions: 2 });
  const base = await localServer(t, { mediaRelay: relay });
  const old = relay.register([stream]);
  relay.register([stream]);
  relay.register([stream]);
  assert.equal((await fetch(base + old.playUrl)).status, 410);
});

test('homepage, standalone player and sample remain served', async t => {
  const base = await localServer(t);
  for (const pathname of ['/', '/player/', '/player.js']) assert.equal((await fetch(base + pathname)).status, 200);
  const sample = await fetch(base + '/samples/frame60.mp4');
  assert.equal(sample.headers.get('content-type'), 'video/mp4');
});

test('sample video supports browser seeking with byte ranges and HEAD', async t => {
  const base = await localServer(t);
  const url = base + '/samples/frame60.mp4';
  const response = await fetch(url, { headers: { Range: 'bytes=0-31' } });
  assert.equal(response.status, 206);
  assert.match(response.headers.get('content-range'), /^bytes 0-31\/\d+$/);
  assert.equal((await response.arrayBuffer()).byteLength, 32);
  const suffix = await fetch(url, { headers: { Range: 'bytes=-12' } });
  assert.equal(suffix.status, 206);
  assert.equal((await suffix.arrayBuffer()).byteLength, 12);
  const invalid = await fetch(url, { headers: { Range: 'bytes=999999999-' } });
  assert.equal(invalid.status, 416);
  const head = await fetch(url, { method: 'HEAD' });
  assert.equal(head.headers.get('accept-ranges'), 'bytes');
  assert.equal(await head.text(), '');
});
