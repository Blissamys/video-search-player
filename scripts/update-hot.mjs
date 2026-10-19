// Refreshes public/hot-data.js so the standalone (file://) build can show
// real Bilibili popular videos without a local server.
import recommendationPolicy from '../public/recommendation-policy.js';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const headers = { 'User-Agent': UA, 'Referer': 'https://www.bilibili.com/' };

function formatDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0
    ? h + ':' + String(m).padStart(2, '0') + ':' + sec
    : m + ':' + sec;
}

function normalizePic(pic) {
  if (!pic) return '';
  return pic.replace(/^http:\/\//, 'https://').replace(/^\/\//, 'https://');
}

const warm = await fetch('https://www.bilibili.com/', { headers, redirect: 'follow' });
const cookies = typeof warm.headers.getSetCookie === 'function' ? warm.headers.getSetCookie() : [];
const buvid = cookies.map(c => c.split(';')[0]).find(c => c.startsWith('buvid3='));

const res = await fetch('https://api.bilibili.com/x/web-interface/popular?ps=50&pn=1', {
  headers: { ...headers, ...(buvid ? { Cookie: buvid } : {}) },
});
const data = await res.json();
if (data.code !== 0 || !data.data || !Array.isArray(data.data.list)) {
  throw new Error('B站热门接口返回错误：' + JSON.stringify(data).slice(0, 200));
}

const items = data.data.list.map(v => ({
  id: v.bvid,
  source: 'bilibili',
  title: v.title || '',
  author: (v.owner && v.owner.name) || '',
  duration: formatDuration(v.duration),
  cover: normalizePic(v.pic),
  plays: (v.stat && v.stat.view) || 0,
  date: v.pubdate ? new Date(v.pubdate * 1000).toISOString().slice(0, 10) : '',
  url: 'https://www.bilibili.com/video/' + v.bvid,
  embed: 'https://player.bilibili.com/player.html?bvid=' + v.bvid
    + '&page=1&high_quality=1&danmaku=0&as_wide=1&autoplay=0',
})).filter(it => it.id && it.title);

const filtered = recommendationPolicy.eligibleVideos(items);
const out = 'window.HOT_SNAPSHOT_UPDATED_AT = ' + JSON.stringify(new Date().toISOString()) + ';\n'
  + 'window.HOT_SNAPSHOT = ' + JSON.stringify(filtered, null, 2) + ';\n';
await (await import('node:fs/promises')).writeFile(new URL('../public/hot-data.js', import.meta.url), out, 'utf8');
console.log('已写入 ' + filtered.length + ' 条经标题筛选的热门视频到 public/hot-data.js');
