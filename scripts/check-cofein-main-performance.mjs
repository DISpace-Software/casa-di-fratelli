// Repeatable local Chromium lab measurement of the built Cofein landing page.
// node script <static-origin> <output-dir> <playwright-module> <chromium-binary>
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [origin, outputRoot, playwrightPath, chromiumPath] = process.argv.slice(2);
assert(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname));
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
await fs.mkdir(outputRoot, { recursive: true });
const report = { localOnly: true, productionBuild: true, note: 'Local Chromium lab, three cold browser-cache samples per profile. Static server sends uncompressed files; these are not real-user or deployed CDN timings.', profiles: [], errors: [], failedResponses: [] };
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
try {
  for (const profile of [
    { name: 'desktop', viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, mobile: false, cpu: 1, latency: 0, downloadBytesPerSecond: -1 },
    { name: 'phone390-dpr1', viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, mobile: true, cpu: 4, latency: 150, downloadBytesPerSecond: 200000 },
    { name: 'phone390', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, mobile: true, cpu: 4, latency: 150, downloadBytesPerSecond: 200000 },
  ]) {
    const samples = [];
    for (let sample = 1; sample <= 3; sample++) {
      const context = await browser.newContext({ viewport: profile.viewport, deviceScaleFactor: profile.deviceScaleFactor, isMobile: profile.mobile, hasTouch: profile.mobile, locale: 'bg-BG', reducedMotion: 'reduce', serviceWorkers: 'block' });
      const page = await context.newPage();
      page.on('pageerror', error => report.errors.push(error.message));
      page.on('response', response => { if (response.status() >= 400) report.failedResponses.push({ profile: profile.name, status: response.status(), url: response.url() }); });
      const cdp = await context.newCDPSession(page); await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }); await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
      if (profile.mobile) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: profile.latency, downloadThroughput: profile.downloadBytesPerSecond, uploadThroughput: 93750, connectionType: 'cellular4g' });
      await page.addInitScript(() => {
        window.__metrics = { lcpMs: 0, cls: 0, longTasks: 0, blockingMs: 0 };
        new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__metrics.lcpMs = entry.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__metrics.cls += entry.value; }).observe({ type: 'layout-shift', buffered: true });
        new PerformanceObserver(list => { for (const entry of list.getEntries()) { window.__metrics.longTasks++; window.__metrics.blockingMs += Math.max(0, entry.duration - 50); } }).observe({ type: 'longtask', buffered: true });
      });
      await page.goto(`${origin}/cofein-preview.html`, { waitUntil: 'networkidle' }); await page.evaluate(() => document.fonts.ready);
      const metrics = await page.evaluate(() => {
        const resources = performance.getEntriesByType('resource'); const sum = list => list.reduce((total, entry) => total + entry.encodedBodySize, 0);
        return { ...window.__metrics, domContentLoadedMs: performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd,
          resourceCount: resources.length, encodedBytes: sum(resources), imageBytes: sum(resources.filter(entry => /\.(webp|jpe?g|png|avif)(\?|$)/.test(entry.name))), fontBytes: sum(resources.filter(entry => /\.(woff2?|ttf)(\?|$)/.test(entry.name))),
          jsBytes: sum(resources.filter(entry => /\.js(\?|$)/.test(entry.name))), cssBytes: sum(resources.filter(entry => /\.css(\?|$)/.test(entry.name))),
          loadedResources: resources.map(entry => ({ path: new URL(entry.name).pathname, bytes: entry.encodedBodySize, durationMs: entry.duration })),
          heroRequests: resources.filter(entry => /\/cofein\/terrace-[0-9]+\.webp/.test(entry.name)).map(entry => ({ path: new URL(entry.name).pathname, initiator: entry.initiatorType })),
          menuDeferred: !resources.some(entry => /CofeinMenu/.test(entry.name)), bookingDeferred: !resources.some(entry => /CofeinBooking/.test(entry.name)),
          noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
          loadedFontFamilies: [...document.fonts].filter(font => font.status === 'loaded').map(font => font.family),
        };
      });
      const icon = await page.request.get(`${origin}/cofein/favicon.svg`); metrics.faviconStatus = icon.status();
      assert(metrics.menuDeferred && metrics.bookingDeferred && metrics.noHorizontalOverflow);
      assert.equal(metrics.heroRequests.length, 1, 'Responsive preload must not fetch duplicate hero variants');
      assert.equal(metrics.heroRequests[0].initiator, 'link', 'The initial hero must use the responsive preload');
      assert.equal(metrics.faviconStatus, 200);
      samples.push({ sample, ...metrics }); console.log(`${profile.name} ${sample}: LCP ${metrics.lcpMs} ms; CLS ${metrics.cls}; ${metrics.encodedBytes} bytes`);
      if (sample === 1) await page.screenshot({ path: path.join(outputRoot, `${profile.name}-production.png`), animations: 'disabled' });
      await context.close();
    }
    report.profiles.push({ ...profile, samples, medianLcpMs: median(samples.map(sample => sample.lcpMs)), medianBlockingMs: median(samples.map(sample => sample.blockingMs)), maxCls: Math.max(...samples.map(sample => sample.cls)) });
  }
  assert.equal(report.errors.length, 0);
  assert.equal(report.failedResponses.length, 0);
} finally { await fs.writeFile(path.join(outputRoot, 'performance.json'), JSON.stringify(report, null, 2)); await browser.close(); }
