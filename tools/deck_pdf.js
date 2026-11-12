// Print the encoded slides into one PDF, one 1920x1080 page per slide, with each slide's links clickable.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

(async () => {
  const [deckDir, out, width, linksFile] = process.argv.slice(2);
  const links = linksFile ? JSON.parse(fs.readFileSync(linksFile, 'utf8')) : {};
  const dir = path.join(deckDir, 'slides', width || '3840');
  const files = fs.readdirSync(dir).filter(f => /^slide-\d+\.jpg$/.test(f)).sort();
  const pages = files.map(f => {
    const n = String(Number(f.match(/\d+/)[0]));
    const anchors = (links[n] || []).map(({ href, box: [l, t, w, h] }) =>
      `<a href="${esc(href)}" style="left:${l}%;top:${t}%;width:${w}%;height:${h}%"></a>`).join('');
    return `<section><img src="file://${path.join(dir, f)}">${anchors}</section>`;
  }).join('');
  const html = `<!doctype html><html><head><style>
    @page { size: 1920px 1080px; margin: 0; }
    html, body { margin: 0; background: #000; }
    section { position: relative; width: 1920px; height: 1080px; break-after: page; }
    section:last-child { break-after: auto; }
    img { display: block; width: 100%; height: 100%; }
    a { position: absolute; display: block; }
  </style></head><body>${pages}</body></html>`;
  const tmp = path.join(path.dirname(out), '.deck-print.html');
  fs.writeFileSync(tmp, html);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`file://${tmp}`, { waitUntil: 'load' });
  await page.pdf({ path: out, width: '1920px', height: '1080px', printBackground: true });
  await browser.close();
  fs.unlinkSync(tmp);
  console.log(`${files.length} pages -> ${out} (${fs.statSync(out).size} bytes)`);
})();
