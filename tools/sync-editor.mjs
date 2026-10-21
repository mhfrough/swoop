// Copies the shared editor (shared/editor) and the Geist font into the Chrome extension and the desktop app.
// Chrome loads an extension only from its own folder and Tauri bundles only desktop/ui, so each gets a copy.
//   node tools/sync-editor.mjs           copy
//   node tools/sync-editor.mjs --check   fail if a copy is out of date (used by npm test and CI)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pairs = [];
for (const target of ['extension', 'desktop/ui']) {
  for (const f of ['editor.js', 'editor.css']) pairs.push([`shared/editor/${f}`, `${target}/editor/${f}`]);
  pairs.push(['assets/fonts/Geist-Variable.woff2', `${target}/assets/fonts/Geist-Variable.woff2`]);
  pairs.push(['assets/fonts/Geist-OFL.txt', `${target}/assets/fonts/Geist-OFL.txt`]);
}

const check = process.argv.includes('--check');
let stale = 0;
for (const [from, to] of pairs) {
  const src = readFileSync(join(root, from));
  const dest = join(root, to);
  const same = existsSync(dest) && Buffer.compare(readFileSync(dest), src) === 0;
  if (same) continue;
  if (check) { console.error(`out of date: ${to} (run npm run sync)`); stale++; continue; }
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, src);
  console.log(`copied ${from} -> ${to}`);
}
if (stale) process.exit(1);
if (check) console.log('editor copies are up to date');
