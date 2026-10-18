const http = require('http');
const fs = require('fs');
const path = require('path');
const { handleSearch } = require('./lib/search-core');

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
  '.ico': 'image/x-icon',
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

function serveStatic(res, pathname) {
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
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
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
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
    sendJSON(res, 200, { ok: true, mode: 'node' });
    return;
  }
  if (url.pathname === '/api/search') {
    handleSearch(url.searchParams)
      .then(data => sendJSON(res, 200, data))
      .catch(err => sendJSON(res, 502, { ok: false, error: err.message || '搜索失败' }));
    return;
  }
  serveStatic(res, url.pathname);
});

function listen(port, attemptsLeft) {
  server.removeAllListeners('error');
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      listen(port + 1, attemptsLeft - 1);
    } else {
      console.error('启动失败:', err.message);
      process.exit(1);
    }
  });
  server.listen(port, HOST, () => {
    console.log('聚合视频搜索服务已启动:');
    console.log('  本机访问: http://localhost:' + port);
    console.log('  局域网/反向代理访问: http://' + HOST + ':' + port);
  });
}

listen(PORT, 10);
