'use strict';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

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

function formatDuration(duration) {
  if (!duration) return '';
  const parts = String(duration).split(':').map(Number);
  if (parts.length === 2 && parts.every(Number.isFinite)) {
    return parts[0] + ':' + String(parts[1]).padStart(2, '0');
  }
  if (parts.length === 3 && parts.every(Number.isFinite)) {
    return parts[0] + ':' + String(parts[1]).padStart(2, '0') + ':' + String(parts[2]).padStart(2, '0');
  }
  return duration;
}

function formatSeconds(total) {
  const seconds = Math.max(0, Math.round(Number(total) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return hours
    ? hours + ':' + String(minutes).padStart(2, '0') + ':' + rest
    : minutes + ':' + rest;
}

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
    const cookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    const buvid = cookies.map(cookie => cookie.split(';')[0]).find(cookie => cookie.startsWith('buvid3='));
    if (buvid) {
      buvidCache = { value: buvid, expires: Date.now() + 3600000 };
      return buvid;
    }
  } catch (_) {
    // Search can still work without this cookie; the API will apply its own risk control.
  }
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
  });
  if (!res.ok) throw new Error('B站接口 HTTP ' + res.status);
  const data = await res.json();
  if (data.code !== 0 || !data.data) {
    throw new Error(data.code === -412
      ? 'B站接口触发风控（-412），请稍后重试或更换关键词'
      : 'B站接口返回错误（code ' + data.code + '）');
  }

  const items = (data.data.result || []).map(video => ({
    id: video.bvid,
    source: 'bilibili',
    title: decodeEntities(video.title),
    author: video.author || '',
    duration: formatDuration(video.duration),
    cover: normalizePic(video.pic),
    plays: typeof video.play === 'number' ? video.play : 0,
    date: video.pubdate ? new Date(video.pubdate * 1000).toISOString().slice(0, 10) : '',
    url: 'https://www.bilibili.com/video/' + video.bvid,
    embed: 'https://player.bilibili.com/player.html?bvid=' + video.bvid
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
  });
  if (!res.ok) throw new Error('B站热门接口 HTTP ' + res.status);
  const data = await res.json();
  if (data.code !== 0 || !data.data) throw new Error('B站热门接口返回错误（code ' + data.code + '）');

  const items = (data.data.list || []).map(video => ({
    id: video.bvid,
    source: 'bilibili',
    title: video.title || '',
    author: (video.owner && video.owner.name) || '',
    duration: formatSeconds(video.duration),
    cover: normalizePic(String(video.pic || '').replace(/^http:\/\//, 'https://')),
    plays: (video.stat && video.stat.view) || 0,
    date: video.pubdate ? new Date(video.pubdate * 1000).toISOString().slice(0, 10) : '',
    url: 'https://www.bilibili.com/video/' + video.bvid,
    embed: 'https://player.bilibili.com/player.html?bvid=' + video.bvid
      + '&page=1&high_quality=1&danmaku=0&as_wide=1&autoplay=0',
  })).filter(item => item.id && item.title);

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

function searchSamples(keyword) {
  const words = String(keyword || '').toLowerCase().split(/\s+/).filter(Boolean);
  const items = SAMPLES.filter(item => {
    const haystack = [item.title, item.author, ...(item.tags || [])].join(' ').toLowerCase();
    return words.every(word => haystack.includes(word));
  }).map(item => ({
    id: item.id,
    source: 'sample',
    title: item.title,
    author: item.author,
    duration: item.duration,
    cover: '/' + item.poster,
    plays: 0,
    date: '',
    url: '/' + item.file,
    playUrl: '/' + item.file,
  }));
  return { items, hasMore: false };
}

const cache = new Map();

function cached(key, factory) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < 300000) return hit.promise;
  const promise = factory();
  cache.set(key, { promise, time: Date.now() });
  return promise;
}

async function handleSearch(query) {
  const keyword = (query.get('keyword') || '').trim().slice(0, 100);
  const source = query.get('source') || 'all';
  const page = Math.max(1, Math.min(5, parseInt(query.get('page') || '1', 10) || 1));

  if (!keyword && source !== 'sample') {
    const hot = await cached('hot', () => searchHot().catch(error => ({
      items: searchSamples('').items,
      notice: '热门接口暂时不可用，已显示本地样片（' + error.message + '）',
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

  const runSource = async name => {
    if (name === 'bilibili') {
      if (!keyword) return { items: [], hasMore: false };
      return cached('bili:' + keyword + ':' + page, () => searchBilibili(keyword, page));
    }
    if (name === 'sample') return cached('sp:' + keyword, () => Promise.resolve(searchSamples(keyword)));
    throw new Error('未知来源: ' + name);
  };

  if (source === 'all') {
    const names = ['bilibili', 'sample'];
    const settled = await Promise.allSettled(names.map(runSource));
    const notices = [];
    const results = [];
    let hasMore = false;

    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(...result.value.items);
        hasMore = hasMore || (names[index] === 'bilibili' && result.value.hasMore && !!keyword);
        if (result.value.notice) notices.push(result.value.notice);
      } else if (names[index] === 'bilibili' && keyword) {
        notices.push(result.reason.message || 'B站搜索暂时不可用');
      }
    });

    return {
      ok: true,
      results: keyword ? results : results.filter(item => item.source === 'sample'),
      notices: keyword ? notices : [],
      hasMore,
      source,
      keyword,
    };
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

module.exports = {
  handleSearch,
  searchBilibili,
  searchHot,
  searchSamples,
};
