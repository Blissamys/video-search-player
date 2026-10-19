'use strict';
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.TEST_BASE || 'http://localhost:3000';
const policy = require('../public/recommendation-policy');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 897, height: 852 } });
    const errors = [];
    const queries = [];
    const pool = Array.from({ length: 35 }, (_, i) => ({ id: 'BVtest' + i, source: 'bilibili', title: '自然与科学 ' + i, cover: '/samples/frame24.jpg', author: '作者', url: 'https://www.bilibili.com/video/BV1cTp66gEi7/' }));
    pool.push({ ...pool[0], id: 'unsafe1', title: '色情视频' }, { ...pool[0], id: 'unsafe2', title: '血腥暴力' }, { ...pool[0], id: 'unsafe3', title: '网络博彩' });
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('vs_history', JSON.stringify(['links'])));
    await page.route('**/cdn.jsdelivr.net/**', route => route.abort());
    await page.route('**/api/health', route => route.fulfill({ json: { ok: true } }));
    await page.route('**/api/search?**', route => {
      const keyword = new URL(route.request().url()).searchParams.get('keyword');
      queries.push(keyword);
      return route.fulfill({ json: { ok: true, results: keyword ? [{ ...pool[0], title: '搜索结果 ' + keyword }] : pool, hasMore: false, notices: [], homeFeed: { available: true, updatedAt: new Date().toISOString() } } });
    });
    await page.goto(base + '/');
    await page.waitForLoadState('networkidle');
    assert.equal(queries.at(-1), '', 'history must not become the homepage query');
    assert.equal(await page.locator('#resultsTitle').innerText(), '今日热门推荐');
    assert.equal(await page.locator('.card').count(), 9);
    assert.equal(await page.locator('#resultsCount').innerText(), '9 个热门随机推荐');
    assert.ok((await page.locator('.card h3').allTextContents()).every(policy.isTitleAllowed));
    assert.match(await page.locator('#headerDate').innerText(), /^\d{4}\/\d{2}\/\d{2} 周/);
    const firstTime = await page.locator('#headerTime').innerText();
    await page.waitForFunction(value => document.querySelector('#headerTime').textContent !== value, firstTime);
    assert.equal(await page.locator('.header-motto').innerText(), '请自觉遵守中学生守则\n保持热爱  星辰大海');
    assert.equal(await page.locator('#homeButton').getAttribute('aria-label'), '回到首页');
    assert.equal(await page.locator('.pixel-person').evaluate(el => getComputedStyle(el).animationIterationCount), 'infinite');
    const firstFrame = await page.locator('.pixel-person').evaluate(el => getComputedStyle(el).transform);
    await page.waitForFunction(value => getComputedStyle(document.querySelector('.pixel-person')).transform !== value, firstFrame);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

    await page.locator('#searchInput').fill('天文');
    await page.locator('#searchForm button').click();
    await page.waitForFunction(() => document.querySelector('#resultsTitle').textContent === '搜索结果' && document.querySelectorAll('.card').length === 1);
    assert.equal(queries.at(-1), '天文');
    await page.locator('#homeButton').click();
    await page.waitForLoadState('networkidle');
    assert.equal(queries.at(-1), '');
    assert.equal(await page.locator('.card').count(), 9);

    await page.locator('#searchInput').fill('音乐');
    await page.locator('#searchForm button').click();
    await page.waitForFunction(() => document.querySelectorAll('.card').length === 1);
    await page.getByRole('link', { name: '网址播放器', exact: true }).click();
    await page.waitForURL('**/player/');
    await page.goBack();
    await page.waitForFunction(() => document.querySelector('#resultsTitle').textContent === '今日热门推荐' && document.querySelectorAll('.card').length === 9);
    assert.equal(queries.at(-1), '');

    // Offline snapshots use the same title filter and clearly identify their origin.
    await page.unroute('**/api/health');
    await page.route('**/api/health', route => route.abort());
    await page.route('**/hot-data.js?**', route => route.fulfill({ contentType: 'application/javascript', body: 'window.HOT_SNAPSHOT=' + JSON.stringify(pool) + ';window.HOT_SNAPSHOT_UPDATED_AT="2026-10-19T10:00:00Z";' }));
    await page.reload();
    await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('#resultsTitle').innerText(), '热门快照');
    assert.equal(await page.locator('.card').count(), 9);
    assert.ok((await page.locator('.card h3').allTextContents()).every(policy.isTitleAllowed));
    assert.match(await page.locator('#feedback').innerText(), /快照/);

    await page.setViewportSize({ width: 700, height: 852 });
    assert.equal(await page.locator('.header-motto span').evaluateAll(spans => spans[1].getBoundingClientRect().top > spans[0].getBoundingClientRect().top), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator('#homeButton').isVisible(), true);
    assert.equal(await page.locator('#headerTime').isVisible(), true);
    if (process.env.MOBILE_SCREENSHOT_PATH) await page.screenshot({ path: process.env.MOBILE_SCREENSHOT_PATH, fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS: nine filtered hot recommendations, history independence, home/back navigation, clock, looping pixel icon, offline filtering and 897/390px layouts');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
