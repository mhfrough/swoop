// Draws Swoop's installer and store artwork from icon.svg and the Geist font, so every download looks like Swoop.
//   node tools/make-brand.mjs
// Windows installer (NSIS) bitmaps, at 2x so they stay sharp on scaled displays:
//   desktop/src-tauri/installer/sidebar.bmp  welcome and finish pages (164 x 314)
//   desktop/src-tauri/installer/header.bmp   the other pages (150 x 57)
// Chrome Web Store:
//   store/promo-small.png (440 x 280), store/marquee.png (1400 x 560), store/screenshot-1.png (1280 x 800)
// Link previews (og:image):
//   assets/og-image.jpg (1200 x 630)
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'icon.svg'), 'utf8').trim();
const MARK = svg.match(/<g[\s\S]*<\/g>/)[0];   // the arrow, without its orange tile
const font = readFileSync(join(root, 'assets/fonts/Geist-Variable.woff2')).toString('base64');

const base = `
  @font-face { font-family: Geist; src: url(data:font/woff2;base64,${font}) format("woff2"); font-weight: 100 900; }
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 100%; height: 100%; overflow: hidden; }
  body { font-family: Geist, sans-serif; -webkit-font-smoothing: antialiased; color: #141210; }
  .tile { display: block; }
  .arrow { display: block; }
  .arrow g { stroke: currentColor; }
`;
const tile = (px) => `<svg class="tile" width="${px}" height="${px}" viewBox="0 0 32 32">${svg.replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg>`;
const arrow = (px, color, width = 2.6) =>
  `<svg class="arrow" width="${px}" height="${px}" viewBox="0 0 32 32" style="color:${color}">${MARK.replace(/stroke="[^"]*"/, 'stroke="currentColor"').replace(/stroke-width="[^"]*"/, `stroke-width="${width}"`)}</svg>`;

const art = {
  sidebar: {
    w: 164, h: 314, scale: 2, out: 'desktop/src-tauri/installer/sidebar.bmp',
    html: `<style>
      body { background: linear-gradient(170deg, #ff6d33 0%, #ff5a1f 55%, #f04a10 100%); padding: 26px 18px; display: flex; flex-direction: column; }
      .big { position: absolute; right: -16px; bottom: -24px; opacity: .16; }
      h1 { margin-top: 18px; font-size: 34px; font-weight: 700; letter-spacing: -0.045em; line-height: 1; }
      p { margin-top: 10px; font-size: 12.5px; font-weight: 500; line-height: 1.35; letter-spacing: -0.01em; color: rgba(20,18,16,.78); }
      .foot { margin-top: 12px; font-size: 11px; font-weight: 600; color: rgba(20,18,16,.72); }
    </style>
    <div class="big">${arrow(150, '#141210', 3)}</div>
    <div style="width:52px;height:52px;border-radius:14px;background:#141210;display:grid;place-items:center">${arrow(40, '#ff5a1f', 2.8)}</div>
    <h1>Swoop</h1>
    <p>Press Print Screen.<br>Drag. Mark it up.<br>Copy or save.</p>
    <p class="foot">Nothing is uploaded.</p>`,
  },
  header: {
    w: 150, h: 57, scale: 2, out: 'desktop/src-tauri/installer/header.bmp',
    html: `<style>
      body { background: #fff; display: flex; align-items: center; gap: 9px; padding-left: 14px; }
      b { font-size: 21px; font-weight: 650; letter-spacing: -0.035em; }
    </style>${tile(30)}<b>Swoop</b>`,
  },
  promoSmall: {
    w: 440, h: 280, scale: 1, out: 'store/promo-small.png',
    html: `<style>
      body { background: linear-gradient(160deg, #ff6d33, #f04a10); padding: 36px 40px; display: flex; flex-direction: column; justify-content: center; position: relative; }
      .big { position: absolute; right: -60px; bottom: -70px; opacity: .15; }
      .row { display: flex; align-items: center; gap: 14px; }
      .t { width: 56px; height: 56px; border-radius: 15px; background: #141210; display: grid; place-items: center; }
      h1 { font-size: 52px; font-weight: 700; letter-spacing: -0.045em; }
      p { margin-top: 18px; font-size: 21px; font-weight: 550; line-height: 1.25; letter-spacing: -0.02em; max-width: 300px; }
    </style>
    <div class="big">${arrow(300, '#141210', 3)}</div>
    <div class="row"><div class="t">${arrow(42, '#ff5a1f', 2.8)}</div><h1>Swoop</h1></div>
    <p>The whole page in one screenshot. Nothing uploaded.</p>`,
  },
  marquee: {
    w: 1400, h: 560, scale: 1, out: 'store/marquee.png',
    html: `<style>
      body { background: linear-gradient(160deg, #ff6d33, #f04a10); display: flex; align-items: center; padding: 0 96px; gap: 80px; position: relative; }
      .copy { flex: 1; }
      .row { display: flex; align-items: center; gap: 20px; }
      .t { width: 84px; height: 84px; border-radius: 22px; background: #141210; display: grid; place-items: center; }
      h1 { font-size: 88px; font-weight: 700; letter-spacing: -0.05em; }
      p { margin-top: 28px; font-size: 34px; font-weight: 550; line-height: 1.2; letter-spacing: -0.025em; max-width: 560px; }
      .page { width: 470px; height: 640px; margin-top: 120px; align-self: flex-start; border-radius: 18px; background: #fff; box-shadow: 0 30px 80px rgba(60,20,0,.35); padding: 26px; position: relative; overflow: hidden; }
      .bar { height: 26px; border-radius: 8px; background: #141210; margin-bottom: 22px; }
      .blk { border-radius: 10px; margin-bottom: 16px; }
      .sel { position: absolute; left: 60px; top: 150px; width: 300px; height: 140px; border: 3px solid #ff3b30; border-radius: 6px; }
      .n { position: absolute; width: 34px; height: 34px; border-radius: 50%; background: #ff3b30; color: #fff; font: 700 18px Geist; display: grid; place-items: center; }
    </style>
    <div class="copy">
      <div class="row"><div class="t">${arrow(62, '#ff5a1f', 2.8)}</div><h1>Swoop</h1></div>
      <p>Capture a whole web page as one image, then mark it up. Free, and nothing is uploaded.</p>
    </div>
    <div class="page">
      <div class="bar"></div>
      <div class="blk" style="height:120px;background:#ffd6a5"></div>
      <div class="blk" style="height:90px;background:#cfe3ff"></div>
      <div class="blk" style="height:140px;background:#d6f5e3"></div>
      <div class="blk" style="height:90px;background:#fff1b8"></div>
      <div class="sel"></div>
      <div class="n" style="left:343px;top:133px">1</div>
    </div>`,
  },
};

// a tiny static server, so the store screenshot can use the real landing page and editor
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = createServer((req, res) => {
  const p = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  const file = p.startsWith(root) && existsSync(p) && statSync(p).isDirectory() ? join(p, 'index.html') : p;
  if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, r));
const origin = `http://localhost:${server.address().port}`;

// 24-bit BMP, bottom-up rows padded to 4 bytes (what NSIS loads)
function bmp(w, h, rgba) {
  const row = Math.ceil((w * 3) / 4) * 4;
  const buf = Buffer.alloc(54 + row * h);
  buf.write('BM', 0);
  buf.writeUInt32LE(buf.length, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(w, 18);
  buf.writeInt32LE(h, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(row * h, 34);
  buf.writeInt32LE(2835, 38);
  buf.writeInt32LE(2835, 42);
  for (let y = 0; y < h; y++) {
    const o = 54 + (h - 1 - y) * row;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      buf[o + x * 3] = rgba[i + 2];
      buf[o + x * 3 + 1] = rgba[i + 1];
      buf[o + x * 3 + 2] = rgba[i];
    }
  }
  return buf;
}

const browser = await chromium.launch();
for (const a of Object.values(art)) {
  const page = await browser.newPage({ viewport: { width: a.w, height: a.h }, deviceScaleFactor: a.scale });
  await page.setContent(`<!doctype html><style>${base}</style>${a.html}`);
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot();
  const out = join(root, a.out);
  mkdirSync(dirname(out), { recursive: true });
  if (out.endsWith('.bmp')) {
    const W = a.w * a.scale, H = a.h * a.scale;
    const rgba = await page.evaluate(async ({ data, W, H }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + data;
      await img.decode();
      const c = new OffscreenCanvas(W, H);
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      return Array.from(x.getImageData(0, 0, W, H).data);
    }, { data: png.toString('base64'), W, H });
    writeFileSync(out, bmp(W, H, rgba));
  } else {
    writeFileSync(out, png);
  }
  console.log(`${a.out} (${a.w * a.scale} x ${a.h * a.scale})`);
  await page.close();
}

// store screenshot: the editor from the landing page with a few marks on the sample page
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.route('https://api.github.com/**', (r) => r.fulfill({ contentType: 'application/json', body: '{}' }));
  await page.goto(origin + '/');
  await page.addStyleTag({ content: '#demo { position: fixed !important; inset: 0; height: auto !important; z-index: 999; } .nav { display: none; }' });
  const canvas = page.locator('#demo .se-canvas');
  await canvas.waitFor();
  await page.waitForTimeout(300);
  const b = await canvas.boundingBox();
  // the sample page is 1200 x 760, fitted into the canvas; work in its own coordinates
  const fit = Math.min((b.width - 48) / 1200, (b.height - 48) / 760);
  const ox = b.x + (b.width - 1200 * fit) / 2, oy = b.y + (b.height - 760 * fit) / 2;
  const at = (x, y) => [ox + x * fit, oy + y * fit];
  const drag = async (tool, from, to) => {
    await page.locator(`#demo button[data-tool="${tool}"]`).click();
    await page.mouse.move(...at(...from));
    await page.mouse.down();
    await page.mouse.move(...at(...to), { steps: 8 });
    await page.mouse.up();
  };
  await drag('blur', [822, 262], [1110, 400]);
  await drag('rect', [80, 214], [748, 440]);
  await drag('arrow', [520, 560], [430, 318]);
  await page.locator('#demo button[data-tool="step"]').click();
  await page.mouse.click(...at(80, 214));
  await page.mouse.click(...at(822, 214));
  await page.locator('#demo button[data-tool="select"]').click();
  await page.mouse.move(2, 2);
  await page.waitForTimeout(300);
  mkdirSync(join(root, 'store'), { recursive: true });
  await page.screenshot({ path: join(root, 'store/screenshot-1.png') });
  console.log('store/screenshot-1.png (1280 x 800)');
}

// link preview for the landing page (og:image): the name and promise, next to the real editor
{
  const shot = readFileSync(join(root, 'store/screenshot-1.png')).toString('base64');
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><style>${base}
    body { background: linear-gradient(155deg, #ff6d33 0%, #ff5a1f 50%, #ec4a10 100%); position: relative; }
    .copy { position: absolute; left: 72px; top: 0; bottom: 0; width: 470px; display: flex; flex-direction: column; justify-content: center; }
    .row { display: flex; align-items: center; gap: 18px; }
    .t { width: 76px; height: 76px; border-radius: 20px; background: #141210; display: grid; place-items: center; }
    h1 { font-size: 80px; font-weight: 700; letter-spacing: -0.05em; line-height: 1; }
    p { margin-top: 30px; font-size: 40px; font-weight: 650; line-height: 1.12; letter-spacing: -0.035em; }
    .small { margin-top: 26px; font-size: 22px; font-weight: 550; letter-spacing: -0.01em; color: rgba(20,18,16,.75); }
    .frame { position: absolute; left: 590px; top: 84px; width: 880px; border-radius: 16px; overflow: hidden; background: #fff;
             box-shadow: 0 30px 80px rgba(70,20,0,.35), 0 0 0 1px rgba(20,18,16,.08); }
    .bar { height: 34px; display: flex; align-items: center; gap: 7px; padding: 0 16px; background: #eeede9; border-bottom: 1px solid rgba(20,18,16,.08); }
    .bar i { width: 11px; height: 11px; border-radius: 50%; background: rgba(20,18,16,.18); }
    .frame img { display: block; width: 100%; }
  </style>
  <div class="copy">
    <div class="row"><div class="t">${arrow(56, '#ff5a1f', 2.8)}</div><h1>Swoop</h1></div>
    <p>Screenshots that stay on your computer.</p>
    <p class="small">Full-page capture for Chrome · Print Screen app for Windows · Free</p>
  </div>
  <div class="frame"><div class="bar"><i></i><i></i><i></i></div><img src="data:image/png;base64,${shot}" alt=""></div>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(root, 'assets/og-image.jpg'), type: 'jpeg', quality: 88 });
  console.log('assets/og-image.jpg (1200 x 630)');
  await page.close();
}

await browser.close();
server.close();
