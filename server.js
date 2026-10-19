const http = require('http');
const fs = require('fs');
const path = require('path');
const { handleSearch, handleVideo } = require('./lib/search-core');
const { createBilibiliResolver } = require('./lib/bilibili-resolver');
const { createMediaRelay } = require('./lib/media-relay');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': ALLOW_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  });
  res.end(body);
}

// ---------------------------------------------------------------------------
// Static file server
// ---------------------------------------------------------------------------

function serveStatic(req, res, pathname) {
  let filePath = path.normalize(path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname));
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.stat(filePath, (statErr, stats) => {
    if (!statErr && stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    if (!statErr && stats.isFile() && ['.mp4', '.webm'].includes(path.extname(filePath).toLowerCase())) {
      const size = stats.size;
      let start = 0;
      let end = size - 1;
      const range = req.headers.range;
      if (range) {
        const parts = range.match(/^bytes=(\d*)-(\d*)$/);
        if (!parts || (!parts[1] && !parts[2])) {
          res.writeHead(416, { 'Content-Range': 'bytes */' + size });
          res.end();
          return;
        }
        if (!parts[1]) start = Math.max(0, size - Number(parts[2]));
        else {
          start = Number(parts[1]);
          if (parts[2]) end = Math.min(end, Number(parts[2]));
        }
        if (start >= size || start > end || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
          res.writeHead(416, { 'Content-Range': 'bytes */' + size });
          res.end();
          return;
        }
      }
      res.writeHead(range ? 206 : 200, {
        'Content-Type': MIME[path.extname(filePath).toLowerCase()],
        'Content-Length': end - start + 1,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
        ...(range ? { 'Content-Range': 'bytes ' + start + '-' + end + '/' + size } : {}),
      });
      if (req.method === 'HEAD') { res.end(); return; }
      const file = fs.createReadStream(filePath, { start, end });
      file.on('error', () => res.destroy());
      res.on('close', () => file.destroy());
      file.pipe(res);
      return;
    }
    fs.readFile(filePath, (err, buf) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(buf);
    });
  });
}

function isLocalRequest(req) {
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return false;
  try {
    const host = new URL('http://' + req.headers.host);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(host.hostname)) return false;
    if (req.headers.origin) {
      const origin = new URL(req.headers.origin);
      if (!['http:', 'https:'].includes(origin.protocol) || origin.host !== host.host) return false;
    }
    if (req.headers['sec-fetch-site'] === 'cross-site') return false;
    return true;
  } catch (_) { return false; }
}

function createServer({ resolveVideo = createBilibiliResolver(), mediaRelay = createMediaRelay() } = {}) {
  return http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (['/api/resolve', '/api/stream'].includes(url.pathname)) {
    if (!isLocalRequest(req)) {
      sendJSON(res, 403, { ok: false, error: '解析功能仅支持本机访问，请在运行服务的电脑打开 localhost 页面' });
      return;
    }
    if (!(url.pathname === '/api/stream' ? ['GET', 'HEAD'] : ['GET']).includes(req.method)) {
      sendJSON(res, 405, { ok: false, error: '不支持此请求方法' });
      return;
    }
    const run = async () => {
      if (url.pathname === '/api/stream') return mediaRelay.serve(req, res, url.searchParams.get('token'));
      const result = await resolveVideo(url.searchParams.get('url'));
      if (!res.destroyed) sendJSON(res, 200, { ok: true, video: result.video, ...mediaRelay.register(result.streams) });
    };
    run().catch(error => {
      if (!res.headersSent && !res.destroyed) sendJSON(res, error.status || 502, { ok: false, error: error.message || '解析失败' });
    });
    return;
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': ALLOW_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }
  if (url.pathname === '/api/health') {
    sendJSON(res, 200, { ok: true, mode: 'node', capabilities: { bilibiliResolve: isLocalRequest(req) } });
    return;
  }
  if (url.pathname === '/api/search') {
    handleSearch(url.searchParams)
      .then(data => sendJSON(res, 200, data))
      .catch(err => sendJSON(res, 502, { ok: false, error: err.message || '搜索失败' }));
    return;
  }
  if (url.pathname === '/api/video') {
    handleVideo(url.searchParams)
      .then(video => sendJSON(res, 200, { ok: true, video }))
      .catch(err => sendJSON(res, 502, { ok: false, error: err.message || '获取视频详情失败' }));
    return;
  }
  serveStatic(req, res, url.pathname);
  });
}

function listen(server, port, attemptsLeft) {
  server.removeAllListeners('error');
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      listen(server, port + 1, attemptsLeft - 1);
    } else {
      console.error('启动失败:', err.message);
      process.exit(1);
    }
  });
  server.listen(port, HOST, () => {
    console.log('聚合视频搜索服务已启动:');
    console.log('  本机访问: http://localhost:' + port);
    console.log('  局域网/反向代理访问: http://' + HOST + ':' + port);
    if (process.env.OPEN_BROWSER === '1' && process.platform === 'darwin') {
      require('node:child_process').spawn('open', ['http://localhost:' + port + '/player/'], { stdio: 'ignore' }).on('error', () => {});
    }
  });
}

if (require.main === module) listen(createServer(), PORT, 10);

module.exports = { createServer };
