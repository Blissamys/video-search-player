'use strict';
// Explicit live smoke test, separate from npm test (requires network access).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.TEST_BASE || 'http://localhost:3000';
const input = process.env.TEST_VIDEO || 'BV1cTp66gEi7';

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    const ranges = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (new URL(response.url()).pathname === '/api/stream') ranges.push({ status: response.status(), range: response.headers()['content-range'] });
    });
    await page.goto(base + '/player/?url=' + encodeURIComponent(input));
    await page.waitForFunction(() => document.querySelector('video').readyState >= 2 || document.querySelector('#feedback .error'), null, { timeout: 45000 });
    assert.equal(await page.locator('#feedback .error').count(), 0, await page.locator('#feedback').innerText());
    const metadata = await page.locator('video').evaluate(video => ({ duration: video.duration, width: video.videoWidth, height: video.videoHeight }));
    assert.ok(metadata.width > 0 && metadata.duration > 0);
    await page.locator('#muteBtn').click();
    await page.locator('#playBtn').click();
    await page.waitForFunction(() => document.querySelector('video').currentTime > 1);
    await page.locator('#playBtn').click();
    await page.waitForFunction(() => document.querySelector('video').paused);
    await page.locator('#rate').fill('1.5');
    assert.equal(await page.locator('video').evaluate(video => video.playbackRate), 1.5);
    await page.locator('#progress').fill('500');
    await page.waitForFunction(() => {
      const video = document.querySelector('video');
      return !video.seeking && Math.abs(video.currentTime - video.duration / 2) < 1;
    }, null, { timeout: 25000 });
    const before = await page.locator('video').evaluate(video => video.currentTime);
    assert.equal(await page.locator('#statFps').innerText(), '--', 'Seeking must reset the frame measurement window');
    await page.locator('#nextFrame').click();
    await page.waitForFunction(() => !document.querySelector('video').seeking);
    const after = await page.locator('video').evaluate(video => video.currentTime);
    assert.ok(after > before && after - before < 0.1, JSON.stringify({ before, after }));
    assert.ok(ranges.some(item => item.status === 206));
    assert.deepEqual(errors, []);
    if (process.env.SCREENSHOT_PATH) await page.screenshot({ path: process.env.SCREENSHOT_PATH, fullPage: true });
    console.log(JSON.stringify({ result: 'PASS', input, metadata, host: await page.locator('#videoHost').innerText(), seek: before, frameStep: after - before, ranges, pageErrors: errors }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
