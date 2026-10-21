// The Chrome extension's full-page capture, end to end, in real Chromium.
// The test loads a copy of the extension with <all_urls> added, because activeTab is only granted
// by a real click on the toolbar button, which a test cannot make.
const { test, expect, chromium } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'extension');
let context, worker, extDir;

test.beforeAll(async () => {
  extDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swoop-ext-'));
  fs.cpSync(SRC, extDir, { recursive: true });
  const mf = JSON.parse(fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf8'));
  mf.host_permissions = ['<all_urls>'];
  fs.writeFileSync(path.join(extDir, 'manifest.json'), JSON.stringify(mf));
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1000, height: 700 },
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
  });
  worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
});
test.afterAll(async () => {
  await context.close();
  fs.rmSync(extDir, { recursive: true, force: true });
});

async function capture(page, url, settings) {
  await page.goto(url);
  await page.bringToFront();
  await worker.evaluate(async (s) => { await chrome.storage.sync.set(s); }, settings || {});
  const editorPromise = context.waitForEvent('page', { timeout: 60000 });
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    captureFull(tab);
  });
  const editor = await editorPromise;
  await editor.waitForLoadState();
  return editor;
}

// read the stored capture back and sample pixels
async function sample(editor, points) {
  return editor.evaluate(async (pts) => {
    const shot = await SwoopStore.get(location.hash.slice(1));
    const bmp = await createImageBitmap(shot.blob);
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const x = c.getContext('2d');
    x.drawImage(bmp, 0, 0);
    const hex = (d) => '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
    return {
      width: bmp.width, height: bmp.height, notice: shot.notice, pixelRatio: shot.pixelRatio,
      px: Object.fromEntries(pts.map(([name, px, py]) => [name, hex(x.getImageData(px, py, 1, 1).data)])),
    };
  }, points);
}
const near = (a, b) => {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return x.every((v, i) => Math.abs(v - y[i]) <= 6);
};

test('captures a long page with a sticky header, a fixed bar, scroll animations and a lazy image', async () => {
  const page = await context.newPage();
  const editor = await capture(page, '/tests/fixtures/long-page.html', { preScroll: true, settle: 250, hideFixed: true });
  const bands = ['#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff', '#fffffc'];
  const pts = [['header', 20, 30], ['firstScreenBottom', 20, 675], ['secondScreenTop', 20, 730]];
  bands.forEach((c, i) => {
    pts.push(['band' + i, 20, 60 + i * 600 + 300]);
    pts.push(['reveal' + i, 200, 60 + i * 600 + 150]);
  });
  pts.push(['lazy', 550, 60 + 6 * 600 + 150]);
  pts.push(['footer', 20, 60 + 8 * 600 + 40]);
  pts.push(['cookie', 20, 60 + 8 * 600 + 100 - 25]);
  const r = await sample(editor, pts);

  expect(r.width).toBe(1000);
  expect(r.height).toBe(60 + 8 * 600 + 100);
  expect(near(r.px.header, '#1d3557')).toBe(true);
  // the sticky header and the cookie bar appear once, not on every screen
  expect(near(r.px.firstScreenBottom, bands[1])).toBe(true);
  expect(near(r.px.secondScreenTop, bands[1])).toBe(true);
  expect(near(r.px.cookie, '#e63946')).toBe(true);
  bands.forEach((c, i) => {
    expect(near(r.px['band' + i], c), 'band ' + i).toBe(true);
    expect(near(r.px['reveal' + i], '#2a9d8f'), 'reveal ' + i + ' was ' + r.px['reveal' + i]).toBe(true);
  });
  expect(near(r.px.lazy, '#f4a261')).toBe(true);
  expect(near(r.px.footer, '#264653')).toBe(true);

  // the page is put back the way it was
  const after = await page.evaluate(() => ({
    y: scrollY,
    header: getComputedStyle(document.querySelector('header')).position,
    cookie: getComputedStyle(document.querySelector('.cookie')).visibility,
    style: !!document.querySelector('style:last-of-type').textContent.includes('swoop'),
  }));
  expect(after).toEqual({ y: 0, header: 'sticky', cookie: 'visible', style: false });

  // the editor shows the picture
  await expect(editor.locator('#title')).toHaveText('Long test page');
  await expect(editor.locator('.se-canvas')).toBeVisible();
  await editor.waitForTimeout(300);
  await editor.screenshot({ path: 'test-results/extension-editor.png' });
  await page.close();
  await editor.close();
});

test('captures an app that scrolls inside a box', async () => {
  const page = await context.newPage();
  const editor = await capture(page, '/tests/fixtures/app-page.html', { preScroll: false, settle: 100 });
  const bands = ['#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff'];
  const pts = [['top', 20, 40]];
  bands.forEach((c, i) => pts.push(['band' + i, 20, 80 + i * 500 + 250]));
  const r = await sample(editor, pts);
  expect(r.height).toBe(80 + 6 * 500);
  expect(near(r.px.top, '#1d3557')).toBe(true);
  bands.forEach((c, i) => expect(near(r.px['band' + i], c), 'band ' + i).toBe(true));
  await page.close();
  await editor.close();
});
