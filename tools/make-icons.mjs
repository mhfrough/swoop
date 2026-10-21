// Renders icon.svg to the PNG sizes the extension, the desktop app and the page need (Chrome needs PNG icons).
//   node tools/make-icons.mjs
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'icon.svg'), 'utf8');
const out = [
  ...[16, 32, 48, 128].map((s) => [s, `extension/icons/${s}.png`]),
  [180, 'assets/icons/apple-touch-icon.png'],
  [512, 'assets/icons/icon-512.png'],
  // Tauri builds its .ico and Linux icons from this one (npx tauri icon)
  [1024, 'desktop/src-tauri/icons/source.png'],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [size, file] of out) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  const png = await page.locator('svg').screenshot({ omitBackground: true });
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), png);
  console.log(`${file} (${size}px)`);
}
await browser.close();
