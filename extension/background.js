/* Swoop: the service worker.
   Click the toolbar button (or Alt+Shift+S) and it captures the whole page, one screen at a time:
   capture.js scrolls the page, captureVisibleTab takes each screen, and the screens are painted
   onto one canvas here. The picture goes into the extension's own IndexedDB and opens in editor.html.
   Nothing is uploaded. */
'use strict';

importScripts('store.js');

const MAX_SIDE = 32767;            // Chrome's largest canvas side
const MAX_AREA = 250000000;        // a little under Chrome's 268M pixel canvas limit
const CAPTURE_GAP = 550;           // captureVisibleTab is limited to 2 calls per second

const DEFAULTS = { preScroll: true, preScrollDelay: 120, settle: 250, hideFixed: true };
const busy = new Set();
let lastCapture = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function settings() {
  try { return Object.assign({}, DEFAULTS, await chrome.storage.sync.get(DEFAULTS)); }
  catch (e) { return Object.assign({}, DEFAULTS); }
}

/* ------------------------------------------------------------ menus and shortcuts */
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'full', title: 'Capture the whole page', contexts: ['action'] });
    chrome.contextMenus.create({ id: 'visible', title: 'Capture the visible part', contexts: ['action'] });
  });
});
chrome.action.onClicked.addListener((tab) => captureFull(tab));
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab) return;
  if (info.menuItemId === 'full') captureFull(tab);
  if (info.menuItemId === 'visible') captureVisible(tab);
});
chrome.commands.onCommand.addListener(async (cmd, tab) => {
  if (cmd !== 'capture-visible') return;
  tab = tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (tab) captureVisible(tab);
});

/* ------------------------------------------------------------ progress on the toolbar button */
async function badge(tabId, text, title) {
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#ff5a1f' });
    if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ tabId, color: '#141210' });
    await chrome.action.setBadgeText({ tabId, text });
    if (title) await chrome.action.setTitle({ tabId, title });
  } catch (e) { /* the tab may be gone */ }
}
async function clearBadge(tabId) {
  try {
    await chrome.action.setBadgeText({ tabId, text: '' });
    await chrome.action.setTitle({ tabId, title: 'Capture the whole page (Alt+Shift+S)' });
  } catch (e) {}
}

/* ------------------------------------------------------------ capture helpers */
async function grab(windowId) {
  const wait = lastCapture + CAPTURE_GAP - Date.now();
  if (wait > 0) await sleep(wait);
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const url = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
      lastCapture = Date.now();
      return url;
    } catch (e) {
      lastErr = e;
      // "exceeds MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND": wait and try again
      lastCapture = Date.now();
      await sleep(CAPTURE_GAP);
    }
  }
  throw lastErr;
}
async function toBitmap(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  return createImageBitmap(blob);
}
async function send(tabId, msg) {
  const res = await chrome.tabs.sendMessage(tabId, Object.assign({ swoop: true }, msg));
  if (!res) throw new Error('The page did not answer');
  if (!res.ok) throw new Error(res.error);
  return res.result;
}
async function stillActive(tabId) {
  const t = await chrome.tabs.get(tabId);
  return t.active;
}

function fileStem(url) {
  let host = 'page';
  try { host = new URL(url).hostname.replace(/^www\./, '') || 'page'; } catch (e) {}
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return 'swoop-' + host + '-' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

async function openEditor(tab, shot) {
  const id = await SwoopStore.put(shot);
  await chrome.tabs.create({ url: chrome.runtime.getURL('editor.html#' + id), index: tab.index + 1, openerTabId: tab.id });
}
async function openError(tab, message) {
  await chrome.tabs.create({ url: chrome.runtime.getURL('editor.html#error=' + encodeURIComponent(message)), index: tab.index + 1, openerTabId: tab.id });
}
function friendly(err) {
  const m = String(err && err.message || err);
  if (/cannot be scripted|cannot access|chrome:\/\/|extensions gallery|webstore|Cannot access contents/i.test(m)) {
    return 'Chrome does not let extensions capture this kind of page (browser pages, settings and the Chrome Web Store).';
  }
  if (/activeTab|permission/i.test(m)) return 'Swoop lost access to the page. Click the Swoop button again.';
  return 'Swoop could not capture this page: ' + m;
}

/* ------------------------------------------------------------ the visible part only */
async function captureVisible(tab, notice) {
  if (busy.has(tab.id)) return;
  busy.add(tab.id);
  try {
    const url = await grab(tab.windowId);
    const bmp = await toBitmap(url);
    const blob = await (await fetch(url)).blob();
    await openEditor(tab, {
      blob, width: bmp.width, height: bmp.height,
      pixelRatio: tab.width ? bmp.width / tab.width : 1,
      title: tab.title || '', url: tab.url || '', name: fileStem(tab.url), notice: notice || '',
    });
    bmp.close();
  } catch (e) {
    await openError(tab, friendly(e));
  } finally {
    busy.delete(tab.id);
  }
}

/* ------------------------------------------------------------ the whole page */
async function captureFull(tab) {
  if (busy.has(tab.id)) return;
  const opt = await settings();
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['capture.js'] });
  } catch (e) {
    // pages that refuse scripts (PDF viewer, some built-in pages) can still give the visible part
    return captureVisible(tab, 'This page does not let extensions scroll it, so Swoop saved the part you can see.');
  }
  busy.add(tab.id);
  await badge(tab.id, '…', 'Swoop is getting the page ready');
  let prepared = false;
  try {
    const info = await send(tab.id, { type: 'prepare', preScroll: opt.preScroll, preScrollDelay: opt.preScrollDelay, hideFixed: opt.hideFixed });
    prepared = true;

    // scroll positions, one screen apart; the last one lines up with the bottom
    const total = info.scrollHeight;
    const step = Math.max(1, info.step);
    const positions = [];
    for (let y = 0; y < total - step; y += step) positions.push(y);
    positions.push(Math.max(0, total - step));
    if (positions.length > 1 && positions[positions.length - 1] === positions[positions.length - 2]) positions.pop();

    let canvas = null, ctx = null, k = 1, scale = 1;
    const bandTop = info.band.top, bandH = info.band.height;
    const below = Math.max(0, info.viewportHeight - bandTop - bandH);
    const outCss = { w: info.viewportWidth, h: bandTop + total + below };

    for (let i = 0; i < positions.length; i++) {
      if (!(await stillActive(tab.id))) throw new Error('You switched tabs while Swoop was capturing. Stay on the page until it finishes.');
      const { y } = await send(tab.id, { type: 'scroll', y: positions[i], index: i, total: positions.length, settle: opt.settle });
      await badge(tab.id, Math.round(((i + 1) / positions.length) * 100) + '', 'Swoop is capturing the page');
      const bmp = await toBitmap(await grab(tab.windowId));

      if (!canvas) {
        scale = bmp.width / info.viewportWidth;           // device pixels per CSS pixel
        const fullW = outCss.w * scale, fullH = outCss.h * scale;
        k = Math.min(1, MAX_SIDE / fullW, MAX_SIDE / fullH, Math.sqrt(MAX_AREA / (fullW * fullH)));
        canvas = new OffscreenCanvas(Math.max(1, Math.round(fullW * k)), Math.max(1, Math.round(fullH * k)));
        ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
      }
      const f = scale * k;                                  // output pixels per CSS pixel
      const sx = 0, sw = bmp.width;
      // the scrolling band of this screen
      const srcTop = bandTop * scale, srcH = Math.min(bandH * scale, bmp.height - srcTop);
      ctx.drawImage(bmp, sx, srcTop, sw, srcH, 0, Math.round((bandTop + y) * f), Math.round(sw * k), Math.round(srcH * k));
      // what sits above and below a scrolling box, taken once
      if (i === 0 && bandTop > 0) ctx.drawImage(bmp, 0, 0, sw, srcTop, 0, 0, Math.round(sw * k), Math.round(srcTop * k));
      if (i === positions.length - 1 && below > 0) {
        const bs = (bandTop + bandH) * scale;
        ctx.drawImage(bmp, 0, bs, sw, bmp.height - bs, 0, Math.round((bandTop + total) * f), Math.round(sw * k), Math.round((bmp.height - bs) * k));
      }
      bmp.close();
    }

    await send(tab.id, { type: 'restore' });
    prepared = false;
    await badge(tab.id, '…', 'Swoop is saving the picture');

    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const notes = [];
    if (k < 0.999) notes.push('This page is taller than Chrome can hold in one picture, so Swoop saved it at ' + Math.round(k * 100) + '% size.');
    if (info.cut) notes.push('Swoop stopped at 60,000 pixels because the page keeps loading more as you scroll.');
    await openEditor(tab, {
      blob, width: canvas.width, height: canvas.height,
      pixelRatio: scale * k,
      title: info.title || tab.title || '', url: tab.url || '', name: fileStem(tab.url), notice: notes.join(' '),
    });
  } catch (e) {
    await openError(tab, friendly(e));
  } finally {
    if (prepared) { try { await send(tab.id, { type: 'restore' }); } catch (e) {} }
    busy.delete(tab.id);
    await clearBadge(tab.id);
  }
}
