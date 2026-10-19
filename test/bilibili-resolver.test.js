'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseBilibiliInput, isAllowedMediaURL, createBilibiliResolver } = require('../lib/bilibili-resolver');

const bvid = 'BV1cTp66gEi7';
const cdn = 'https://upos-sz-mirrorcos.bilivideo.com/upgcxcode/test.mp4?deadline=9999999999';
const view = { bvid, aid: 123, title: '<标题>', owner: { name: '作者' }, pic: 'https://i0.hdslb.com/a.jpg', rights: {}, pages: [
  { cid: 11, page: 1, part: '第一集', duration: 10 }, { cid: 22, page: 2, part: '第二集', duration: 20 },
] };
const play = { quality: 64, format: 'mp4720', timelength: 20000, accept_quality: [64, 16], support_formats: [{ quality: 64, new_description: '720P 准高清' }], durl: [{ url: 'https://peer.edge.mountaintoys.cn:4483/a.mp4', backup_url: [cdn], length: 20000 }] };
function fixture({ metadata = view, playback = play, redirects = {} } = {}) {
  const calls = [];
  const fetchImpl = async (value, options) => {
    const url = new URL(value); calls.push({ url, options });
    if (redirects[url.href]) return new Response(null, { status: 302, headers: { location: redirects[url.href] } });
    if (url.hostname === 'b23.tv') return new Response('', { status: 200 });
    return Response.json({ code: 0, data: url.pathname.endsWith('/view') ? metadata : playback });
  };
  return { calls, resolve: createBilibiliResolver({ fetchImpl }) };
}

test('accepts BV/AV IDs, mobile URLs, share text and selected part', () => {
  assert.equal(parseBilibiliInput(bvid).bvid, bvid);
  assert.equal(parseBilibiliInput('av123').aid, '123');
  assert.equal(parseBilibiliInput('https://m.bilibili.com/video/' + bvid + '?p=2').page, 2);
  assert.equal(parseBilibiliInput('【视频】 https://www.bilibili.com/video/' + bvid + '/?p=2 分享').page, 2);
  assert.equal(parseBilibiliInput('https://b23.tv/abc').shortURL, 'https://b23.tv/abc');
});

test('rejects unsupported protocols, hosts, credentials, ports and invalid parts', () => {
  for (const value of ['', 'file:///tmp/a', 'https://bilibili.com.evil.test/video/' + bvid, 'https://api.bilibili.com/video/' + bvid, 'https://user@www.bilibili.com/video/' + bvid, 'https://www.bilibili.com:9999/video/' + bvid, 'https://www.bilibili.com/video/' + bvid + '?p=0', 'https://www.bilibili.com/video/' + bvid + '?p=2x', 'https://www.bilibili.com/bangumi/play/ep123']) {
    assert.throws(() => parseBilibiliInput(value), Error, value);
  }
});

test('only accepts standard Bili media CDN URLs', () => {
  assert.equal(isAllowedMediaURL(cdn), true);
  for (const value of ['https://127.0.0.1/a.mp4', 'https://bilivideo.com.evil.test/a', 'https://user@a.bilivideo.com/a', 'https://a.bilivideo.com:4483/a', 'http://a.bilivideo.com/a', 'https://peer.edge.mountaintoys.cn/a']) assert.equal(isAllowedMediaURL(value), false, value);
});

test('resolves selected part, returns actual quality and canonical share URL', async () => {
  const { resolve, calls } = fixture();
  const result = await resolve('https://www.bilibili.com/video/' + bvid + '?p=2&tracking=remove');
  assert.equal(result.video.title, '<标题>');
  assert.equal(result.video.page, 2);
  assert.equal(result.video.url, 'https://www.bilibili.com/video/' + bvid + '/?p=2');
  assert.equal(result.video.quality, '720P 准高清');
  assert.equal(result.video.pages.length, 2);
  assert.deepEqual(result.streams, [cdn]);
  assert.equal(calls[1].url.searchParams.get('cid'), '22');
  assert.equal(calls[1].url.searchParams.get('fnval'), '1');
});

test('AV numbers become canonical BV links', async () => {
  const { resolve, calls } = fixture();
  const result = await resolve('av123');
  assert.equal(calls[0].url.searchParams.get('aid'), '123');
  assert.equal(result.video.id, bvid);
});

test('expands approved short-link redirects and preserves part selection', async () => {
  const { resolve, calls } = fixture({ redirects: { 'https://b23.tv/abc': 'https://www.bilibili.com/video/' + bvid + '?p=2' } });
  const result = await resolve('https://b23.tv/abc');
  assert.equal(result.video.page, 2);
  assert.equal(calls[0].options.redirect, 'manual');
});

test('never requests an unapproved redirect destination', async () => {
  const { resolve, calls } = fixture({ redirects: { 'https://b23.tv/abc': 'http://127.0.0.1/admin' } });
  await assert.rejects(resolve('https://b23.tv/abc'), /跳转|支持/);
  assert.equal(calls.length, 1);
});

test('limits redirect loops and rejects non-redirecting short links', async () => {
  const { resolve, calls } = fixture({ redirects: { 'https://b23.tv/abc': 'https://b23.tv/abc' } });
  await assert.rejects(resolve('https://b23.tv/abc'), /跳转/);
  assert.ok(calls.length <= 5);
  await assert.rejects(fixture().resolve('https://b23.tv/missing'), /短链/);
});

test('invalid part and paid videos are rejected before requesting streams', async () => {
  const first = fixture();
  await assert.rejects(first.resolve('https://www.bilibili.com/video/' + bvid + '?p=3'), /分 P/);
  assert.equal(first.calls.length, 1);
  const second = fixture({ metadata: { ...view, rights: { ugc_pay: 1 } } });
  await assert.rejects(second.resolve(bvid), /付费|限制/);
  assert.equal(second.calls.length, 1);
});

test('does not play previews or silently truncate multi-segment content', async () => {
  await assert.rejects(fixture({ playback: { ...play, is_preview: 1 } }).resolve(bvid), /试看|限制/);
  await assert.rejects(fixture({ playback: { ...play, durl: [...play.durl, ...play.durl] } }).resolve(bvid), /分段|格式/);
  await assert.rejects(fixture({ playback: { ...play, format: 'flv' } }).resolve(bvid), /格式|MP4/);
  await assert.rejects(fixture({ playback: { ...play, durl: [{ url: 'https://evil.test/a' }] } }).resolve(bvid), /播放地址|CDN/);
});

test('gives actionable upstream risk-control and login errors', async () => {
  for (const [code, pattern] of [[-412, /风控/], [-101, /登录/], [-404, /不存在|删除/]]) {
    const resolve = createBilibiliResolver({ fetchImpl: async () => Response.json({ code, message: 'error' }) });
    await assert.rejects(resolve(bvid), pattern);
  }
});

test('aborts slow upstream requests with a clear timeout error', async () => {
  const resolve = createBilibiliResolver({ timeoutMs: 10, fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) });
  await assert.rejects(resolve(bvid), /超时/);
});
