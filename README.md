# Swoop

Full-page screenshots for Chrome, and a tiny screenshot app for Windows and Linux. Nothing is uploaded.

**[Open the Swoop page](https://mhfrough.github.io/swoop/)**

- **Swoop for Chrome** captures a whole web page, top to bottom, as one image. Sticky headers and cookie bars show once, lazy images load first, and pages that scroll inside a box work too.
- **Swoop for desktop** waits in the tray. Press Print Screen, drag over any part of the frozen screen, mark it up, then press Enter to copy or Ctrl+S to save.
- **One free editor** in both: arrow, box, ellipse, line, pen, highlighter, text, numbered steps, blur and crop, with undo and redo.

## Privacy

There is no Swoop server, account or analytics. Captures go to your clipboard or your disk and nowhere else. See [privacy.html](privacy.html).

## Run it locally

The landing page is static:

```
npm run serve
```

Then open http://localhost:8175.

Load the extension in Chrome: open `chrome://extensions`, turn on Developer mode, choose **Load unpacked** and pick the `extension` folder.

Build the desktop app (needs Rust and, on Linux, the WebKitGTK libraries listed in `.github/workflows/release.yml`):

```
cd desktop
npm install
npm run build
```

## How it is built

| Part | Files |
|---|---|
| The editor, shared by everything | `shared/editor/` (copied into `extension/` and `desktop/ui/` by `npm run sync`) |
| Chrome extension (Manifest V3) | `extension/` |
| Desktop app (Tauri 2, Rust) | `desktop/src-tauri/`, `desktop/ui/` |
| Landing page | `index.html`, `site.css`, `site.js`, `tokens.css`, `privacy.html` |
| Tests (Playwright) | `tests/`, run with `npm test` |
| Release builds | `.github/workflows/release.yml`: push a `v*` tag |
| Installer and store artwork | `node tools/make-brand.mjs` draws `desktop/src-tauri/installer/` and `store/` from `icon.svg` |
| Chrome Web Store listing | `store/listing.md` |

The plan and the research behind it are in [PLAN.md](PLAN.md).

## Licence

MIT. The Geist fonts are under the SIL Open Font License.
