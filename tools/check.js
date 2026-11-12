// Load a page, record every request that leaves the local server or fails, and screenshot it.
const { chromium } = require('playwright');

(async () => {
  const [url, shot, width] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: Number(width || 1440), height: 900 } });
  const origin = new URL(url).origin;
  const external = new Set();
  const failed = [];
  const errors = [];
  page.on('request', r => { if (!r.url().startsWith(origin) && !r.url().startsWith('data:')) external.add(r.url()); });
  page.on('requestfailed', r => failed.push(`${r.url()} ${r.failure()?.errorText}`));
  page.on('response', r => { if (r.status() >= 400) failed.push(`${r.url()} HTTP ${r.status()}`); });
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(2500);
  const hydrated = await page.evaluate(() => document.querySelectorAll('[data-hydrated]').length + ' hydrated links; title=' + document.title + '; bodyText=' + document.body.innerText.length);
  const deck = await page.evaluate(() => [...document.querySelectorAll('a')].map(a => a.getAttribute('href')).join(' | '));
  await page.screenshot({ path: shot, fullPage: true });
  console.log(JSON.stringify({ hydrated, deck, external: [...external], failed, errors }, null, 1));
  await browser.close();
})();
