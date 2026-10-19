'use strict';

const { randomBytes } = require('node:crypto');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { HEADERS, ResolveError, isAllowedMediaURL } = require('./bilibili-resolver');

function createMediaRelay({ fetchImpl = globalThis.fetch, now = Date.now, ttlMs = 30 * 60 * 1000, maxSessions = 128, timeoutMs = 20000 } = {}) {
  const sessions = new Map();

  function prune() {
    for (const [token, entry] of sessions) if (entry.expiresAt <= now()) sessions.delete(token);
  }

  function register(streams) {
    prune();
    if (!Array.isArray(streams) || !streams.length || streams.some(url => !isAllowedMediaURL(url))) {
      throw new ResolveError('没有有效的 CDN 播放地址');
    }
    let expiresAt = now() + ttlMs;
    for (const value of streams) {
      const deadline = Number(new URL(value).searchParams.get('deadline'));
      if (deadline > 0) expiresAt = Math.min(expiresAt, deadline * 1000);
    }
    if (expiresAt <= now()) throw new ResolveError('播放地址已过期，请重新解析', 410);
    while (sessions.size >= maxSessions) sessions.delete(sessions.keys().next().value);
    const token = randomBytes(32).toString('hex');
    sessions.set(token, { streams: streams.slice(0, 4), expiresAt });
    return { playUrl: '/api/stream?token=' + token, expiresAt };
  }

  async function serve(req, res, token) {
    prune();
    const entry = sessions.get(token);
    if (!entry) throw new ResolveError('播放地址已过期，请重新解析', 410);
    const range = req.headers.range;
    if (range && (!/^bytes=(?:\d+-\d*|-\d+)$/.test(range)
      || (/^bytes=\d+-\d+$/.test(range) && Number(range.split('=')[1].split('-')[0]) > Number(range.split('-')[1])))) {
      throw new ResolveError('不支持此 Range 请求', 416);
    }
    const controller = new AbortController();
    let timer;
    const touch = () => {
      clearTimeout(timer);
      timer = setTimeout(() => controller.abort(), timeoutMs);
    };
    const onClose = () => controller.abort();
    res.once('close', onClose);
    try {
      let upstream;
      let lastError;
      for (const candidate of entry.streams) {
        let destination = candidate;
        try {
          for (let hop = 0; hop < 4; hop++) {
            if (!isAllowedMediaURL(destination)) throw new ResolveError('CDN 跳转地址不受支持');
            touch();
            const response = await fetchImpl(destination, {
              method: req.method, headers: { ...HEADERS, ...(range ? { Range: range } : {}) },
              redirect: 'manual', signal: controller.signal,
            });
            if ([301, 302, 303, 307, 308].includes(response.status)) {
              await response.body?.cancel();
              const location = response.headers.get('location');
              if (!location) throw new ResolveError('CDN 跳转缺少地址');
              destination = new URL(location, destination).href;
              continue;
            }
            if (response.status === 416) { upstream = response; break; }
            const type = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
            if (![200, 206].includes(response.status) || !['video/mp4', 'application/octet-stream'].includes(type)) {
              await response.body?.cancel();
              throw new ResolveError('视频 CDN 暂时不可用（HTTP ' + response.status + '）');
            }
            upstream = response;
            break;
          }
          if (!upstream) throw new ResolveError('CDN 跳转次数过多');
          break;
        } catch (error) {
          lastError = error;
          if (controller.signal.aborted) throw error;
        }
      }
      if (!upstream) throw lastError || new ResolveError('视频 CDN 暂时不可用');
      const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
      for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag']) {
        if (upstream.headers.has(key)) headers[key] = upstream.headers.get(key);
      }
      if (upstream.status === 416 || req.method === 'HEAD') {
        await upstream.body?.cancel();
        res.writeHead(upstream.status, headers);
        res.end();
        return;
      }
      if (!upstream.body) throw new ResolveError('视频 CDN 未返回播放数据');
      res.writeHead(upstream.status, headers);
      const reader = upstream.body.getReader();
      const cancelReader = () => { reader.cancel().catch(() => {}); };
      controller.signal.addEventListener('abort', cancelReader, { once: true });
      clearTimeout(timer);
      async function* chunks() {
        try {
          while (!controller.signal.aborted) {
            let chunk;
            // Only time an upstream read. No timer runs while yield/pipeline waits
            // for a paused browser to drain its receive buffer.
            touch();
            try { chunk = await reader.read(); }
            finally { clearTimeout(timer); }
            if (chunk.done) break;
            yield chunk.value;
          }
        } finally {
          controller.signal.removeEventListener('abort', cancelReader);
          await reader.cancel().catch(() => {});
        }
      }
      await pipeline(Readable.from(chunks(), { objectMode: false }), res, { signal: controller.signal });
    } catch (error) {
      if (res.destroyed) return;
      if (res.headersSent) { res.destroy(); return; }
      if (controller.signal.aborted) throw new ResolveError('视频数据读取超时，请重新解析', 504);
      if (error instanceof ResolveError) throw error;
      throw new ResolveError('无法连接视频 CDN，请重新解析或在源站播放');
    } finally {
      clearTimeout(timer);
      res.removeListener('close', onClose);
      controller.abort();
    }
  }

  return { register, serve };
}

module.exports = { createMediaRelay };
