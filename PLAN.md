# Swoop: plan

Swoop is a set of three things that share one name, one editor and one look:

1. **Swoop for Chrome**: an extension that captures a whole web page, from top to bottom, as one image.
2. **Swoop for desktop**: a small Windows and Linux app that starts with the computer. Press Print Screen, drag over any part of the screen, mark it up and save.
3. **The Swoop page**: one landing page with the downloads for both.

Nothing is uploaded, anywhere. There is no Swoop server, account or cloud gallery.

## Name

"Swoop": you swoop down a whole page, or swoop on one part of the screen. It is a short verb like the other projects (Pinch, Flick, Scrawl, Sizzle). I found no screenshot tool or extension already called Swoop. Nab, Pluck and Lasso were taken by extensions, and Snag is too close to Snagit.

## What the research says

### The two references

| | GoFullPage (Chrome) | Lightshot (desktop) |
|---|---|---|
| Capture | Click the icon or Alt+Shift+P. It scrolls the page and stitches the parts. | Print Screen, then drag over a region. |
| Editor | Crop, annotate and emoji, but only in the paid tier. | Pen, line, arrow, rectangle, marker, text and colour, drawn right on the selection. |
| Save | PNG, JPG, PDF; copy; past captures in a list. | Copy, save, or upload to prnt.sc and get a short link. |
| Weak spots | The editor is behind a paywall. Very tall pages are split into several images, one tab each. | Uploads go to a public server. Old prnt.sc links could be guessed in order, so other people's screenshots were readable. No blur tool. Windows and Mac only (no Linux). |

So Swoop competes on three points:
- **The editor is free and the same everywhere**: one editor for the extension, the desktop app and the demo on the landing page.
- **Private by design**: nothing is uploaded and there are no links. Copy and save only.
- **Linux is a first-class platform**, next to Windows.

Editor tools that users expect from Flameshot, ShareX and CleanShot: arrow, rectangle, ellipse, line, pen, highlighter, text, **numbered steps** (1, 2, 3 markers for how-to guides), **blur/pixelate** (to hide emails and names) and crop, with undo and redo.

### How a full-page capture works in Chrome (Manifest V3)

There are two ways:

1. **Scroll and stitch** with `chrome.tabs.captureVisibleTab`: scroll one screen at a time, capture what is visible and paint the parts onto one canvas. GoFullPage and most others work this way.
2. **The DevTools protocol** (`chrome.debugger` + `Page.captureScreenshot` with `captureBeyondViewport`): one call, but Chrome shows a yellow "is debugging this browser" bar on every capture, the install screen warns about full access to the browser, and pages with full-height layouts (100vh) come out wrong.

**Swoop uses scroll and stitch, one screen at a time.** Doing it a screen at a time is the only way that works with everything a real page does:

- Chrome allows **two `captureVisibleTab` calls per second** (`MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND = 2`). Swoop waits at least 550 ms between captures. That pause also gives scroll animations time to settle.
- **Animations and lazy loading:** before capturing, Swoop scrolls the whole page once, top to bottom, with short stops. That triggers scroll-reveal animations, lazy images and infinite lists. Then it goes back to the top, waits for images and fonts, and starts the real pass.
- **Fixed and sticky elements:** sticky elements switch to their normal place in the page, so they appear once. Fixed headers show only in the first screen, and fixed bars at the bottom (cookie notes, chat buttons) only in the last. Fixed full-screen backgrounds stay in every screen.
- **Smooth scrolling** on the page is turned off during capture, and the scroll bar is hidden so it never appears in the picture.
- **Pages that scroll inside a box** (web apps with `body { overflow: hidden }`): Swoop finds the largest scrolling element and scrolls that instead.
- **Size limits:** a canvas in Chrome can be at most 32,767 px tall and 268 million pixels in total. A taller page is scaled down to fit, and the editor says so.
- **Permissions:** only `activeTab`, `scripting`, `contextMenus`, `storage` and `unlimitedStorage`. `activeTab` means Swoop can only see a tab after you click its button, so the install screen shows no "read all your data" warning.
- The captured image is stored in the extension's own IndexedDB and opened in the editor tab. Nothing leaves the browser.

### How the desktop app stays small

| Option | Installer | Idle memory | Linux | Shares the editor |
|---|---|---|---|---|
| Electron | 80 to 100 MB | 100 MB+ | yes | yes |
| Qt / C++ (Flameshot) | 15 to 30 MB with Qt | low | yes | no |
| .NET WinForms | under 1 MB | low | no | no |
| **Tauri 2 (Rust + the system web view)** | **3 to 6 MB** | low | yes | **yes** |

**Swoop desktop is built with Tauri 2.** It uses the web view the system already has (WebView2 on Windows 10 and 11, WebKitGTK on Linux), so the installer stays a few megabytes and the editor is the same code as the extension.

- **Screen capture:** the Rust crate `xcap` (Windows, Linux X11 and Wayland).
- **Hotkey:** `tauri-plugin-global-shortcut`, Print Screen by default. Windows 11 gives Print Screen to the Snipping Tool by default, so Swoop checks for that and tells you where to turn it off.
- **Start with the computer:** `tauri-plugin-autostart`, on after install, with a switch in the tray menu.
- **One copy only:** `tauri-plugin-single-instance`. Running `swoop --capture` again starts a capture in the copy that is already running. On Wayland, where apps cannot grab global keys, you bind a system shortcut to that command (this is how Flameshot works too).
- **Frozen screen, like Lightshot:** the screen is captured first, then shown full screen in an overlay window. You select on a still picture, so menus and tooltips stay visible.
- **Fast overlay:** the overlay window is created once, hidden, at start-up, so it appears straight away. The pixels go to it as raw bytes over Tauri's binary IPC, with no PNG encode in between.
- **Copy to clipboard** from Rust (`arboard`) so it works on Windows, X11 and Wayland.
- **Release build tuned for size:** `opt-level = "s"`, LTO, one codegen unit, `panic = "abort"`, stripped symbols.
- **Downloads:** Windows `.exe` setup (NSIS); Linux `.deb`, `.rpm` and `.AppImage`. GitHub Actions builds all of them on every version tag.

## Architecture

```
swoop/
  index.html, site.css, site.js, tokens.css   the landing page (GitHub Pages)
  privacy.html                                 privacy policy (the Chrome Web Store asks for one)
  shared/editor/                               THE editor: editor.js + editor.css, no dependencies
  extension/                                   Chrome extension (Manifest V3), loads as-is
    manifest.json, background.js, capture.js, editor.html, editor-page.js, options.*
    editor/                                    copy of shared/editor (tools/sync-editor.mjs)
  desktop/                                     Tauri 2 app
    ui/                                        overlay.html + copy of shared/editor
    src-tauri/                                 Rust: capture, hotkey, tray, autostart, save, clipboard
  tools/sync-editor.mjs                        copies shared/editor into the extension and the app
  tests/                                       Playwright: editor, full-page capture, landing page
  .github/workflows/                           desktop release builds, extension zip
```

### The editor (shared/editor)

One plain JavaScript file, no framework, no build step. The same code runs in three places.

- **Document model:** the base picture plus a list of shapes (`rect`, `ellipse`, `arrow`, `line`, `pen`, `marker`, `text`, `step`, `pixelate`) and a crop box. Every change is a step that undo and redo can walk through.
- **Drawing:** one canvas the size of the window, redrawn with the current zoom and pan. The picture can be any height (a 25,000 px page) without a giant canvas in the page.
- **Saving:** at full resolution on an off-screen canvas: PNG, JPG or WebP, or copy.
- **Two layouts:**
  - *Full*: toolbar on top, zoom and pan. Used by the extension and the landing page demo.
  - *Overlay*: the picture fills the window at 1:1, you drag a selection and the toolbar floats next to it. Used by the desktop app.
- **Keyboard:** V select, C crop, R rectangle, O ellipse, A arrow, L line, P pen, H highlighter, T text, N step, B blur. Ctrl+Z, Ctrl+Shift+Z, Delete, Ctrl+C copy, Ctrl+S save, Esc.

## Build order

1. Plan, name and design tokens. *(this file)*
2. The shared editor, tested on its own in the browser.
3. The Chrome extension: capture engine, editor tab, options. Tested with Playwright on a test page that has a sticky header, a fixed bottom bar, scroll-reveal animation and lazy images.
4. The desktop app: tray, hotkey, capture, overlay, save and copy, autostart. Built and run on Windows here, and on Linux through GitHub Actions.
5. The landing page: hero with the live editor, extension, desktop, privacy, questions, downloads.
6. Release: GitHub Actions for installers, a zip for the Chrome Web Store, store listing, screenshots.

## Later

- Capture a selected area, or one element, in the extension. Capture wide pages that scroll sideways.
- Desktop: one selection across several monitors (v1 uses the monitor under the pointer), a delayed capture timer, and window capture.
- Save as PDF, split into pages.
- Recent captures list in the extension.
- Firefox and Edge store listings (Edge loads the Chrome build as it is).
- Mac build (Tauri supports it; it needs signing and the Screen Recording permission flow).

## Things to set up before launch

- A GitHub repository `mhfrough/swoop` with Pages turned on.
- A Chrome Web Store developer account (one-time 5 USD fee), the store listing and screenshots.
- Code signing for the Windows installer. Without it, SmartScreen warns on first download. Options: Azure Trusted Signing (low monthly cost) or a standard certificate.
