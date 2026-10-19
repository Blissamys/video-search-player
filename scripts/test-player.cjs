'use strict';
// Optional browser check: npm install --no-save playwright, then run with the local server active.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const base = process.env.TEST_BASE || 'http://localhost:3000';
const bvid = 'BV1cTp66gEi7';

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/cdn.jsdelivr.net/**', route => route.abort());
    let calls = 0;
    await page.route('**/api/resolve?**', async route => {
      calls++;
      const input = new URL(route.request().url()).searchParams.get('url');
      const part = input.includes('p=2') ? 2 : 1;
      await route.fulfill({ json: {
        ok: true, playUrl: '/samples/frame60.mp4', expiresAt: Date.now() + 60000,
        video: { id: bvid, title: '<安全标题>', author: '测试作者', quality: '720P', page: part,
          pages: [{ page: 1, title: '第一集' }, { page: 2, title: '第二集' }],
          url: 'https://www.bilibili.com/video/' + bvid + '/?p=' + part },
      } });
    });
    await page.goto(base + '/player/?url=' + bvid);
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => document.getElementById('videoTitle').textContent === '<安全标题>', null, { timeout: 5000 });
    await page.waitForFunction(() => document.querySelector('video').readyState >= 2);
    assert.match(await page.locator('#videoHost').innerText(), /720P/);
    assert.equal(await page.locator('#partSelect option').count(), 2);
    assert.ok(!page.url().includes('token='));
    assert.match(page.url(), /url=https/);
    await page.locator('#rate').fill('1.5');
    assert.equal(await page.locator('video').evaluate(video => video.playbackRate), 1.5);
    await page.locator('video').evaluate(video => { video.muted = true; });
    await page.locator('#playBtn').click();
    await page.waitForFunction(() => document.querySelector('video').currentTime > 0.1);
    await page.locator('#playBtn').click();
    const before = await page.locator('video').evaluate(video => video.currentTime);
    await page.locator('#fpsSelect').selectOption('60');
    await page.locator('#nextFrame').click();
    await page.waitForFunction(() => !document.querySelector('video').seeking);
    const after = await page.locator('video').evaluate(video => video.currentTime);
    assert.ok(after > before && after - before < 0.1, JSON.stringify({ before, after }));
    await page.locator('#partSelect').selectOption('2');
    await page.waitForFunction(() => document.querySelector('#partSelect').value === '2' && document.querySelector('video').readyState >= 2);
    assert.match(new URL(page.url()).searchParams.get('url'), /p=2/);
    assert.equal(calls, 2);
    await page.locator('#sourceInput').fill(base + '/samples/frame24.mp4');
    await page.locator('#sourceForm button[type=submit]').click();
    await page.waitForFunction(() => document.querySelector('video').videoWidth > 0);
    assert.equal(await page.locator('#partPicker').isVisible(), false);
    await page.locator('#localFile').setInputFiles(path.join(__dirname, '../public/samples/frame30.mp4'));
    await page.waitForFunction(() => document.querySelector('#videoHost').textContent === '本机文件' && document.querySelector('video').readyState >= 2);
    assert.match(await page.locator('video').getAttribute('src'), /^blob:/);

    // A delayed resolution must not replace a newer local-file choice.
    await page.unroute('**/api/resolve?**');
    let release;
    let entered;
    const seen = new Promise(resolve => { entered = resolve; });
    await page.route('**/api/resolve?**', async route => {
      entered();
      await new Promise(resolve => { release = resolve; });
      await route.fulfill({ json: { ok: false, error: '过时请求' } }).catch(() => {});
    });
    await page.locator('#sourceInput').fill(bvid);
    await page.locator('#sourceForm button[type=submit]').click();
    await seen;
    await page.locator('#localFile').setInputFiles(path.join(__dirname, '../public/samples/frame24.mp4'));
    release();
    await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('#videoTitle').innerText(), 'frame24.mp4');
    assert.ok(!(await page.locator('#feedback').innerText()).includes('过时请求'));

    await page.unroute('**/api/resolve?**');
    await page.route('**/api/resolve?**', route => route.fulfill({ status: 429, json: { ok: false, error: 'B站接口触发风控，请稍后重试' } }));
    await page.locator('#sourceInput').fill(bvid);
    await page.locator('#sourceForm button[type=submit]').click();
    await page.locator('#feedback .error').waitFor();
    assert.match(await page.locator('#feedback').innerText(), /风控/);
    assert.equal(await page.locator('#originalLink').isVisible(), true);

    // An unusable media URL may trigger one automatic reparse, never an endless loop.
    await page.unroute('**/api/resolve?**');
    let refreshCalls = 0;
    await page.route('**/api/resolve?**', route => {
      refreshCalls++;
      return route.fulfill({ json: { ok: true, playUrl: '/missing-video.mp4', video: {
        id: bvid, title: '失效媒体', author: '', quality: '720P', page: 1, pages: [],
        url: 'https://www.bilibili.com/video/' + bvid + '/?p=1',
      } } });
    });
    await page.locator('#retryResolve').click();
    await page.waitForFunction(() => document.querySelector('#feedback').textContent.includes('视频流暂时无法播放'));
    await page.waitForLoadState('networkidle');
    assert.equal(refreshCalls, 2);

    await page.route('**/api/health', route => route.fulfill({ json: { ok: true, mode: 'node', capabilities: { bilibiliResolve: true } } }));
    await page.route('**/api/search?**', route => route.fulfill({ json: { ok: true, results: [{
      id: bvid, source: 'bilibili', title: '首页测试视频', author: '测试', plays: 10,
      url: 'https://www.bilibili.com/video/' + bvid + '/',
      embed: 'https://player.bilibili.com/player.html?bvid=' + bvid,
    }], notices: [], hasMore: false } }));
    await page.route('**/api/video?**', route => route.fulfill({ json: { ok: true, video: { description: '视频详情' } } }));
    await page.route('**/player.bilibili.com/**', route => route.abort());
    await page.goto(base + '/');
    await page.waitForLoadState('networkidle');
    await page.locator('.card').first().click();
    assert.equal(await page.locator('#playParsed').isVisible(), true);
    assert.equal(new URL(new URL(await page.locator('#playParsed').getAttribute('href'), base).href).searchParams.get('url'), 'https://www.bilibili.com/video/' + bvid + '/');
    assert.deepEqual(errors, []);
    console.log('PASS: input, metadata, share, parts, playback, rate, frames, direct/local file, cancellation, risk errors, bounded refresh and homepage entry');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
