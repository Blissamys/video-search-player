'use strict';

const PAGE_HOSTS = new Set(['bilibili.com', 'www.bilibili.com', 'm.bilibili.com']);
const SHORT_HOSTS = new Set(['b23.tv', 'www.b23.tv']);
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
  Referer: 'https://www.bilibili.com/',
};

class ResolveError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

function parseBilibiliInput(value) {
  const input = String(value || '').trim();
  if (!input || input.length > 4096) throw new ResolveError('请输入有效的 B 站视频链接或 BV/AV 编号', 400);
  if (/^BV[0-9a-zA-Z]{10}$/.test(input)) return { bvid: input, page: 1 };
  if (/^av[1-9][0-9]*$/i.test(input)) return { aid: input.slice(2), page: 1 };
  const match = input.match(/https?:\/\/[^\s<>【】「」（）]+/i);
  let url;
  try { url = new URL((match ? match[0] : input).replace(/[，。；！,;!)]+$/, '')); }
  catch (_) { throw new ResolveError('不支持的链接，请输入 B 站视频页面或 b23.tv 短链', 400); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) {
    throw new ResolveError('不支持此链接协议、端口或登录信息', 400);
  }
  if (SHORT_HOSTS.has(url.hostname)) {
    if (!/^\/[a-zA-Z0-9]+\/?$/.test(url.pathname)) throw new ResolveError('无效的 b23.tv 短链', 400);
    return { shortURL: url.href };
  }
  if (!PAGE_HOSTS.has(url.hostname)) throw new ResolveError('仅支持 B 站视频页面及 b23.tv 短链', 400);
  const video = url.pathname.match(/^\/video\/(BV[0-9a-zA-Z]{10}|av[1-9][0-9]*)\/?$/i);
  if (!video) throw new ResolveError('仅支持普通 B 站视频页面，暂不支持番剧、直播或其他页面', 400);
  const pageValue = url.searchParams.get('p') || '1';
  const page = Number(pageValue);
  if (!/^[1-9][0-9]*$/.test(pageValue) || !Number.isSafeInteger(page) || page > 10000) {
    throw new ResolveError('分 P 编号必须是有效的正整数', 400);
  }
  const id = video[1];
  return /^av/i.test(id) ? { aid: id.slice(2), page } : { bvid: 'BV' + id.slice(2), page };
}

function isAllowedMediaURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && ['bilivideo.com', 'bilivideo.cn'].some(domain => url.hostname === domain || url.hostname.endsWith('.' + domain));
  } catch (_) { return false; }
}

function apiError(data) {
  const code = Number(data.code);
  if ([-412, -352, -401].includes(code)) return new ResolveError('B站接口触发风控（' + code + '），请稍后重试或在源站播放', 429);
  if (code === -101) return new ResolveError('此视频需要登录，请在 B 站源站播放', 403);
  if ([-403, -10403, 6002105].includes(code)) return new ResolveError('此视频存在访问限制，请在 B 站源站播放', 403);
  if ([-404, 62002, 62004, 62012].includes(code)) return new ResolveError('视频不存在、已删除或不可见', 404);
  return new ResolveError('B站接口返回错误（code ' + code + '）');
}

function createBilibiliResolver({ fetchImpl = globalThis.fetch, timeoutMs = 12000 } = {}) {
  // Keep the timer active while reading JSON, not just while receiving headers.
  async function request(url, readJSON = true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { headers: HEADERS, redirect: 'manual', signal: controller.signal });
      if (!readJSON) {
        await response.body?.cancel();
        return { status: response.status, location: response.headers.get('location') };
      }
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 412 || response.status === 429) throw new ResolveError('B站接口触发风控，请稍后重试', 429);
        throw new ResolveError('B站接口 HTTP ' + response.status);
      }
      const data = await response.json();
      if (data.code !== 0 || !data.data) throw apiError(data);
      return data.data;
    } catch (error) {
      if (controller.signal.aborted) throw new ResolveError('B站接口请求超时，请稍后重试', 504);
      if (error instanceof ResolveError) throw error;
      throw new ResolveError('无法连接 B站接口，请检查网络后重试');
    } finally { clearTimeout(timer); }
  }

  return async function resolve(value) {
    let input = parseBilibiliInput(value);
    for (let hop = 0; input.shortURL; hop++) {
      if (hop >= 4) throw new ResolveError('短链跳转次数过多', 400);
      const result = await request(input.shortURL, false);
      if (![301, 302, 303, 307, 308].includes(result.status) || !result.location) {
        throw new ResolveError('短链无效或已过期，请复制完整 B 站视频链接', 400);
      }
      // Validate each hop before any next request, including cross-host redirects.
      input = parseBilibiliInput(new URL(result.location, input.shortURL).href);
    }
    const params = new URLSearchParams(input.bvid ? { bvid: input.bvid } : { aid: input.aid });
    const metadata = await request('https://api.bilibili.com/x/web-interface/view?' + params);
    const rights = metadata.rights || {};
    if (rights.pay || rights.ugc_pay || rights.arc_pay || metadata.is_upower_exclusive) {
      throw new ResolveError('此视频属于付费或限制内容，请在 B 站源站播放', 403);
    }
    const pages = (metadata.pages || []).map(part => ({
      page: Number(part.page), cid: Number(part.cid), title: String(part.part || ''), duration: Number(part.duration) || 0,
    }));
    const selected = pages.find(part => part.page === input.page);
    if (!selected || !selected.cid) throw new ResolveError('该视频没有指定的分 P，请选择有效分 P', 400);
    const bvid = metadata.bvid;
    if (!/^BV[0-9a-zA-Z]{10}$/.test(bvid || '')) throw new ResolveError('B站详情缺少有效视频编号');
    const playParams = new URLSearchParams({ bvid, cid: String(selected.cid), qn: '64', fnval: '1', fnver: '0', fourk: '0' });
    const playback = await request('https://api.bilibili.com/x/player/playurl?' + playParams);
    if (playback.is_preview || playback.is_pay || playback.need_login || playback.need_vip) {
      throw new ResolveError('上游仅提供试看或限制播放，请在 B 站源站播放', 403);
    }
    if (!/^mp4/i.test(playback.format || '') || playback.durl?.length !== 1) {
      throw new ResolveError('当前返回分段或非 MP4 格式，暂无法在本地播放器播放，请使用源站');
    }
    const media = playback.durl[0];
    const streams = [...new Set([media.url, ...(Array.isArray(media.backup_url) ? media.backup_url : [])].filter(isAllowedMediaURL))];
    if (!streams.length) throw new ResolveError('没有可用的标准 CDN 播放地址，请稍后重试');
    const format = (playback.support_formats || []).find(item => item.quality === playback.quality);
    return {
      video: {
        id: bvid, source: 'bilibili', title: String(metadata.title || bvid), author: String(metadata.owner?.name || ''),
        cover: String(metadata.pic || '').replace(/^http:/, 'https:'), page: selected.page, pages,
        duration: selected.duration, quality: format?.new_description || format?.display_desc || String(playback.quality || '默认画质'),
        url: 'https://www.bilibili.com/video/' + bvid + '/?p=' + selected.page,
      },
      streams,
    };
  };
}

module.exports = { ResolveError, HEADERS, parseBilibiliInput, isAllowedMediaURL, createBilibiliResolver };
