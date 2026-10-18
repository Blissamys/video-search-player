const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '3000', 10);
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

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function decodeEntities(text) {
  return String(text)
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function normalizePic(pic) {
  if (!pic) return '';
  return pic.startsWith('//') ? 'https:' + pic : pic;
}

function formatDuration(d) {
  if (!d) return '';
  const parts = String(d).split(':').map(Number);
  if (parts.length === 2 && parts.every(Number.isFinite)) {
    return parts[0] + ':' + String(parts[1]).padStart(2, '0');
  }
  if (parts.length === 3 && parts.every(Number.isFinite)) {
    return parts[0] + ':' + String(parts[1]).padStart(2, '0') + ':' + String(parts[2]).padStart(2, '0');
  }
  return d;
}

function formatSeconds(total) {
  const s = Math.max(0, Math.round(Number(total) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? h + ':' + String(m).padStart(2, '0') + ':' + sec : m + ':' + sec;
}

// ---------------------------------------------------------------------------
// Bilibili search (server-side proxy)
// ---------------------------------------------------------------------------

let buvidCache = { value: null, expires: 0 };

async function getBiliCookie() {
  if (buvidCache.value && Date.now() < buvidCache.expires) return buvidCache.value;
  try {
    const res = await fetchWithTimeout('https://www.bilibili.com/', {
      headers: {
        'User-Agent': UA,
        'Referer': 'https://www.bilibili.com/',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    }, 6000);
    const cookies = typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [];
    const buvid = cookies.map(c => c.split(';')[0]).find(c => c.startsWith('buvid3='));
    if (buvid) {
      buvidCache = { value: buvid, expires: Date.now() + 3600_000 };
      return buvid;
    }
  } catch (_) { /* API may still work without the cookie */ }
  return buvidCache.value || '';
}

async function searchBilibili(keyword, page = 1) {
  const api = 'https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword='
    + encodeURIComponent(keyword) + '&page=' + page;
  const cookie = await getBiliCookie();
  const res = await fetchWithTimeout(api, {
    headers: {
      'User-Agent': UA,
      'Referer': 'https://search.bilibili.com/',
      'Origin': 'https://www.bilibili.com',
      ...(cookie ? { Cookie: cookie } : {}),
    },
  }, 8000);
  if (!res.ok) throw new Error('B站接口 HTTP ' + res.status);
  const data = await res.json();
  if (data.code !== 0 || !data.data) {
    throw new Error(data.code === -412
      ? 'B站接口触发风控（-412），请稍后重试或更换关键词'
      : 'B站接口返回错误（code ' + data.code + '）');
  }
  const items = (data.data.result || []).map(v => ({
    id: v.bvid,
    source: 'bilibili',
    title: decodeEntities(v.title),
    author: v.author || '',
    duration: formatDuration(v.duration),
    cover: normalizePic(v.pic),
    plays: typeof v.play === 'number' ? v.play : 0,
    date: v.pubdate ? new Date(v.pubdate * 1000).toISOString().slice(0, 10) : '',
    url: 'https://www.bilibili.com/video/' + v.bvid,
    embed: 'https://player.bilibili.com/player.html?bvid=' + v.bvid
      + '&page=1&high_quality=1&danmaku=0&as_wide=1&autoplay=0',
  }));
  return { items, hasMore: items.length >= 20 };
}

async function searchHot() {
  const api = 'https://api.bilibili.com/x/web-interface/popular?ps=20&pn=1';
  const cookie = await getBiliCookie();
  const res = await fetchWithTimeout(api, {
    headers: {
      'User-Agent': UA,
      'Referer': 'https://www.bilibili.com/',
      ...(cookie ? { Cookie: cookie } : {}),
    },
  }, 8000);
  if (!res.ok) throw new Error('B站热门接口 HTTP ' + res.status);
  const data = await res.json();
  if (data.code !== 0 || !data.data) {
    throw new Error('B站热门接口返回错误（code ' + data.code + '）');
  }
  const items = (data.data.list || []).map(v => ({
    id: v.bvid,
    source: 'bilibili',
    title: v.title || '',
    author: (v.owner && v.owner.name) || '',
    duration: formatSeconds(v.duration),
    cover: normalizePic(String(v.pic || '').replace(/^http:\/\//, 'https://')),
    plays: (v.stat && v.stat.view) || 0,
    date: v.pubdate ? new Date(v.pubdate * 1000).toISOString().slice(0, 10) : '',
    url: 'https://www.bilibili.com/video/' + v.bvid,
    embed: 'https://player.bilibili.com/player.html?bvid=' + v.bvid
      + '&page=1&high_quality=1&danmaku=0&as_wide=1&autoplay=0',
  })).filter(it => it.id && it.title);
  if (!items.length) throw new Error('B站热门接口返回为空');
  return { items };
}

const SAMPLES = [
  { id: 'f24', title: '24fps 帧率测试片', file: 'samples/frame24.mp4', poster: 'samples/frame24.jpg', author: '本地生成', duration: '0:02', tags: ['测试', '帧率', '24', '电影'] },
  { id: 'f25', title: '25fps 帧率测试片', file: 'samples/frame25.mp4', poster: 'samples/frame25.jpg', author: '本地生成', duration: '0:02', tags: ['测试', '帧率', '25', 'PAL'] },
  { id: 'f30', title: '30fps 帧率测试片', file: 'samples/frame30.mp4', poster: 'samples/frame30.jpg', author: '本地生成', duration: '0:02', tags: ['测试', '帧率', '30'] },
  { id: 'f50', title: '50fps 帧率测试片', file: 'samples/frame50.mp4', poster: 'samples/frame50.jpg', author: '本地生成', duration: '0:02', tags: ['测试', '帧率', '50'] },
  { id: 'f60', title: '60fps 高帧率测试片', file: 'samples/frame60.mp4', poster: 'samples/frame60.jpg', author: '本地生成', duration: '0:02', tags: ['测试', '帧率', '60', '高帧率'] },
];

function matchDemo(item, keyword) {
  if (!keyword) return true;
  const hay = [item.title, item.author, ...(item.tags || [])].join(' ').toLowerCase();
  return keyword.toLowerCase().split(/\s+/).every(w => !w || hay.includes(w));
}

function searchSamples(keyword) {
  const items = SAMPLES.filter(it => matchDemo(it, keyword)).map(it => ({
    id: it.id,
    source: 'sample',
    title: it.title,
    author: it.author,
    duration: it.duration,
    cover: '/' + it.poster,
    plays: 0,
    date: '',
    url: '/' + it.file,
    playUrl: '/' + it.file,
  }));
  return { items, hasMore: false };
}

// ---------------------------------------------------------------------------
// Search cache + API entry
// ---------------------------------------------------------------------------

const cache = new Map();

function cached(key, factory) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < 5 * 60_000) return hit.promise;
  const promise = factory();
  cache.set(key, { promise, time: Date.now() });
  return promise;
}

async function handleSearch(query) {
  const keyword = (query.get('keyword') || '').trim().slice(0, 100);
  const source = query.get('source') || 'all';
  const page = Math.max(1, Math.min(5, parseInt(query.get('page') || '1', 10) || 1));

  // Default view: real Bilibili popular videos. Falls back to local clips if
  // the popular API is temporarily blocked by risk control.
  if (!keyword && source !== 'sample') {
    const hot = await cached('hot', () => searchHot().catch(err => ({
      items: searchSamples(''),
      notice: '热门接口暂时不可用，已显示本地样片（' + err.message + '）',
    })));
    return {
      ok: true,
      results: hot.items,
      notices: hot.notice ? [hot.notice] : [],
      hasMore: false,
      source,
      keyword,
    };
  }

  const runSource = async (name) => {
    if (name === 'bilibili') {
      if (!keyword) return { items: [], hasMore: false };
      return cached('bili:' + keyword + ':' + page, () => searchBilibili(keyword, page));
    }
    if (name === 'sample') return cached('sp:' + keyword, () => Promise.resolve(searchSamples(keyword)));
    throw new Error('未知来源: ' + name);
  };

  if (source === 'all') {
    const names = ['bilibili', 'sample'];
    const settled = await Promise.allSettled(names.map(n => runSource(n)));
    const notices = [];
    const results = [];
    let hasMore = false;
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        results.push(...r.value.items);
        hasMore = hasMore || (names[i] === 'bilibili' && r.value.hasMore && !!keyword);
        if (r.value.notice) notices.push(r.value.notice);
      } else if (names[i] === 'bilibili' && keyword) {
        notices.push(r.reason.message || 'B站搜索暂时不可用');
      }
    });
    if (!keyword) {
      return {
        ok: true,
        results: results.filter(r => r.source === 'sample'),
        notices: [],
        hasMore: false,
        source,
        keyword,
      };
    }
    return { ok: true, results, notices, hasMore, source, keyword };
  }

  const result = await runSource(source);
  return {
    ok: true,
    results: result.items,
    notices: result.notice ? [result.notice] : [],
    hasMore: !!result.hasMore && !!keyword,
    source,
    keyword,
  };
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
  server.listen(port, '127.0.0.1', () => {
    console.log('聚合视频搜索服务已启动: http://localhost:' + port);
  });
}

listen(PORT, 10);
