// Capture every slide of a Figma prototype as PNG frames.
// Pass 1 walks the flow with the right arrow key to list each slide's node-id (saved to walk.json).
// Pass 2 opens each node-id in a fresh page, so no slide transition is on screen, then samples frames
// until three in a row are identical. A slide that never stops changing keeps every distinct frame
// for deck_build.py to choose from.
const { chromium } = require('playwright');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const IMAGE_HOST = 's3-alpha-sig.figma.com';
const GL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const HIDE_TOASTS = '[data-testid="visual-bell-root"], [class*="visual_bell"] { display: none !important; }';
const MAX_SAMPLES = 16;

function protoUrl(base, nodeId) {
  const u = new URL(base);
  u.searchParams.set('hide-ui', '1');
  u.searchParams.set('scaling', 'contain');
  if (nodeId) u.searchParams.set('node-id', nodeId);
  return u.toString();
}

async function walk(browser, base, maxSlides) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const nodeId = () => new URL(page.url()).searchParams.get('node-id');
  await page.goto(protoUrl(base), { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => new URL(location.href).searchParams.get('node-id'), null, { timeout: 60000 });
  await page.waitForTimeout(5000);
  const ids = [nodeId()];
  let end = 'max slides reached';
  while (ids.length < maxSlides) {
    const before = nodeId();
    await page.mouse.move(5, 5);
    await page.keyboard.press('ArrowRight');
    const moved = await page.waitForFunction(
      prev => new URL(location.href).searchParams.get('node-id') !== prev, before, { timeout: 20000 },
    ).then(() => true, () => false);
    if (!moved) { end = `ArrowRight left ${before} unchanged for 20s`; break; }
    const id = nodeId();
    if (ids.includes(id)) { end = `flow returned to ${id}`; break; }
    ids.push(id);
    console.log(`walk: ${ids.length} ${id}`);
    await page.waitForTimeout(4000);
  }
  await page.close();
  return { ids, end };
}

async function shoot(browser, base, id, outDir, stem) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  const pending = new Set();
  const failures = [];
  let last = Date.now();
  page.on('request', r => { if (new URL(r.url()).host === IMAGE_HOST) { pending.add(r); last = Date.now(); } });
  page.on('requestfinished', r => { if (pending.delete(r)) last = Date.now(); });
  page.on('requestfailed', r => { if (pending.delete(r)) { failures.push(r.url().split('?')[0]); last = Date.now(); } });
  await page.goto(protoUrl(base, id), { waitUntil: 'load', timeout: 90000 });
  const start = Date.now();
  await page.waitForTimeout(8000);
  while (Date.now() - start < 60000 && !(pending.size === 0 && Date.now() - last > 3000)) {
    await page.waitForTimeout(250);
  }
  const hideToasts = () => page.evaluate(css => {
    if (!document.getElementById('capture-hide-toasts')) {
      const s = document.createElement('style');
      s.id = 'capture-hide-toasts';
      s.textContent = css;
      document.head.appendChild(s);
    }
  }, HIDE_TOASTS);

  const frames = [];
  const times = [];
  let streak = 1;
  for (let i = 0; i < MAX_SAMPLES; i++) {
    if (i > 0) await page.waitForTimeout(3000);
    await hideToasts();
    const t0 = Date.now();
    const buf = await page.screenshot({ timeout: i === 0 ? 900000 : 300000 });
    times.push(Date.now() - t0);
    const hash = crypto.createHash('sha1').update(buf).digest('hex');
    const prev = frames[frames.length - 1];
    if (prev && prev.hash === hash) {
      streak += 1;
      if (streak >= 3) break;
      continue;
    }
    streak = 1;
    const file = `${stem}-${String(frames.length + 1).padStart(2, '0')}.png`;
    fs.writeFileSync(path.join(outDir, file), buf);
    frames.push({ file, hash });
  }
  const landed = new URL(page.url()).searchParams.get('node-id');
  await page.close();
  return {
    nodeId: id, landed, still: streak >= 3, frames: frames.map(f => f.file),
    pendingImages: pending.size, imageFailures: failures.length, shotMs: times,
  };
}

(async () => {
  const [base, outDir, maxSlides] = process.argv.slice(2);
  fs.mkdirSync(path.join(outDir, 'frames'), { recursive: true });
  const browser = await chromium.launch({ args: GL_ARGS });
  const walkFile = path.join(outDir, 'walk.json');
  if (!fs.existsSync(walkFile)) {
    fs.writeFileSync(walkFile, JSON.stringify(await walk(browser, base, Number(maxSlides || 60)), null, 1));
  }
  const { ids, end } = JSON.parse(fs.readFileSync(walkFile));
  console.log(`walk (${end}): ${ids.length} slides`);
  const slides = [];
  for (const [i, id] of ids.entries()) {
    const stem = `slide-${String(i + 1).padStart(2, '0')}`;
    const r = await shoot(browser, base, id, path.join(outDir, 'frames'), stem);
    slides.push({ index: i + 1, ...r, frames: r.frames.map(f => `frames/${f}`) });
    console.log(`shot: ${JSON.stringify(slides[slides.length - 1])}`);
  }
  fs.writeFileSync(path.join(outDir, 'slides.json'), JSON.stringify({ source: base, walkEnded: end, slides }, null, 1));
  await browser.close();
  console.log(`done: ${slides.length} slides`);
})();
