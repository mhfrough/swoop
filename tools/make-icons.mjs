// Renders icon.svg to the PNG sizes the extension, the desktop app and the page need (Chrome needs PNG icons),
// and the desktop app's Windows icon. Each size is drawn from the SVG at that size, so small ones stay sharp.
//   node tools/make-icons.mjs
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'icon.svg'), 'utf8');
const icons = 'desktop/src-tauri/icons';
const out = [
  ...[16, 32, 48, 128].map((s) => [s, `extension/icons/${s}.png`]),
  [180, 'assets/icons/apple-touch-icon.png'],
  [512, 'assets/icons/icon-512.png'],
  // The desktop bundle's PNGs (tauri.conf.json bundle.icon), used by the Linux packages
  [32, `${icons}/32x32.png`],
  [64, `${icons}/64x64.png`],
  [128, `${icons}/128x128.png`],
  [256, `${icons}/128x128@2x.png`],
  [512, `${icons}/icon.png`],
  [1024, `${icons}/source.png`],
];
// The sizes Windows asks for in title bars, the taskbar, Start, Settings and Explorer
const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256];

const browser = await chromium.launch();
const page = await browser.newPage();
async function render(size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  return page.locator('svg').screenshot({ omitBackground: true });
}
function write(file, data) {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), data);
}

for (const [size, file] of out) {
  write(file, await render(size));
  console.log(`${file} (${size}px)`);
}

// An .ico: a 6-byte header, one 16-byte entry per size, then the PNGs
async function ico(file, sizes) {
  const images = [];
  for (const size of sizes) images.push(await render(size));
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach((png, i) => {
    const s = sizes[i], e = 6 + 16 * i;
    head.writeUInt8(s >= 256 ? 0 : s, e);
    head.writeUInt8(s >= 256 ? 0 : s, e + 1);
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(png.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  write(file, Buffer.concat([head, ...images]));
  console.log(`${file} (${sizes.join(', ')}px)`);
}
// The app and its installer
await ico(`${icons}/icon.ico`, ICO_SIZES);
// The page's favicon.ico, for browsers and tools that don't take the SVG one
await ico('favicon.ico', [16, 32, 48]);
await browser.close();
