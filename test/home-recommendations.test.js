'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../public/recommendation-policy');
const { handleHome, handleSearch } = require('../lib/search-core');

const video = (id, title = '自然风景 ' + id) => ({ id, title, source: 'bilibili', url: 'https://www.bilibili.com/video/' + id });

test('recommendations reject unsuitable titles across configured categories', () => {
  for (const title of ['色情视频', '出现<色情>内容', '出现<血腥>画面', '<b>裸</b>聊', '成人电影', '成人话题', '成人影片', '带着100万，我们见了成人网红...', '成人向内容', '成人用品', '女优采访', '裸聊骗局', '血腥场面', '暴力冲突', '虐猫视频', '赌博赢钱', '网络博彩', '吸毒过程', '贩毒现场', '自残直播', 'NSFW合集', 'R-18', '18＋', '色 情', '裸\u200b聊', '血🔥腥']) {
    assert.equal(policy.isTitleAllowed(title), false, title);
  }
});

test('ordinary titles and references to protecting minors remain eligible', () => {
  for (const title of ['未成年人保护知识', '中学生学习方法', '暴雨后的彩虹', '杀菌原理', '游戏性能测试', '热血青春', '星辰大海']) assert.equal(policy.isTitleAllowed(title), true, title);
  for (const title of ['', '  ', null, undefined]) assert.equal(policy.isTitleAllowed(title), false);
});

test('filter then randomly choose nine unique Bili videos without mutating the pool', () => {
  const pool = [...Array.from({ length: 30 }, (_, i) => video('BV' + i)), video('unsafe', '血腥'), { id: 'sample', source: 'sample', title: '本地样片' }, video('BV1')];
  const before = JSON.stringify(pool);
  const first = policy.chooseRecommendations(pool, () => 0);
  const second = policy.chooseRecommendations(pool, () => 0.9999);
  assert.equal(first.length, 9);
  assert.equal(new Set(first.map(item => item.id)).size, 9);
  assert.ok(first.every(item => item.source === 'bilibili' && policy.isTitleAllowed(item.title)));
  assert.notDeepEqual(first, second);
  assert.equal(JSON.stringify(pool), before);
});

test('does not reintroduce blocked titles or samples when fewer than nine remain', () => {
  assert.deepEqual(policy.chooseRecommendations([video('1'), video('2', '暴力')]).map(item => item.id), ['1']);
  assert.deepEqual(policy.chooseRecommendations([{ source: 'sample', title: '样片', id: '1' }]), []);
});

test('date and time use Asia/Shanghai, including local midnight', () => {
  assert.deepEqual(policy.clockParts(new Date('2026-10-19T15:59:58Z')), { date: '2026/10/19 周一', time: '23:59:58', day: '2026-10-19' });
  assert.equal(policy.clockParts(new Date('2026-10-19T16:00:00Z')).day, '2026-10-20');
  assert.equal(policy.clockParts(new Date('2026-10-19T16:00:00Z')).time, '00:00:00');
});

test('home feed uses current hot data and never a stored search keyword', async () => {
  const result = await handleHome({ getHot: async () => ({ items: Array.from({ length: 25 }, (_, i) => video('BV' + i)), updatedAt: '2026-10-19T10:00:00Z' }), random: () => 0 });
  assert.equal(result.keyword, '');
  assert.equal(result.results.length, 9);
  assert.equal(result.hasMore, false);
  assert.equal(result.homeFeed.available, true);
  assert.equal(result.homeFeed.updatedAt, '2026-10-19T10:00:00Z');
});

test('unavailable hot data is reported honestly without unrelated fallback samples', async () => {
  const result = await handleHome({ getHot: async () => { throw new Error('上游不可用'); } });
  assert.equal(result.homeFeed.available, false);
  assert.equal(result.results.length, 0);
  assert.match(result.notices[0], /热门/);
});

test('search filtering preserves ranking and samples without a nine-item limit', () => {
  const good = Array.from({ length: 12 }, (_, i) => video('safe' + i));
  const sample = { id: 'f24', source: 'sample', title: '24fps 帧率测试片' };
  const pool = [video('adult', '成人向内容'), ...good, video('gore', '血腥画面'), sample];
  const before = JSON.stringify(pool);
  assert.deepEqual(policy.filterSearchResults(pool), [...good, sample]);
  assert.equal(JSON.stringify(pool), before);
});

test('merged keyword search API filters titles but preserves the upstream next-page flag', async () => {
  const result = await handleSearch(new URLSearchParams({ keyword: 'search-filter-fixture-1', source: 'all' }), {
    biliSearch: async () => ({ items: [video('a', '自然风景'), video('b', '暴力场面'), video('c', '成人网红'), video('d', '科学知识')], hasMore: true }),
  });
  assert.deepEqual(result.results.map(item => item.id), ['a', 'd']);
  assert.equal(result.hasMore, true);
});

test('Bili-only search and subsequent pages apply the same title filter', async () => {
  const run = page => handleSearch(new URLSearchParams({ keyword: 'search-filter-fixture-2', source: 'bilibili', page: String(page) }), {
    biliSearch: async () => ({ items: [video('bad', '<b>血腥</b>画面'), video('ok' + page, '天文知识')], hasMore: true }),
  });
  assert.deepEqual((await run(2)).results.map(item => item.id), ['ok2']);
  assert.equal((await run(5)).hasMore, false);
});

test('a fully filtered page still lets the caller continue to the next upstream page', async () => {
  const result = await handleSearch(new URLSearchParams({ keyword: 'search-filter-fixture-3', source: 'all' }), {
    biliSearch: async () => ({ items: [video('bad', '血腥暴力')], hasMore: true }),
  });
  assert.deepEqual(result.results, []);
  assert.equal(result.hasMore, true);
});
