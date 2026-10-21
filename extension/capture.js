/* Swoop: runs inside the page while it is being captured.
   background.js injects it, then drives it with messages:
     prepare  hide scroll bars, pre-scroll the page to wake up animations and lazy images,
              pin sticky elements in place, sort fixed elements, measure
     scroll   go to one position, show or hide fixed elements for that screen, wait for it to settle
     restore  put everything back as it was
   The page is never sent anywhere; this file only scrolls it and changes styles while capturing. */
(() => {
  'use strict';
  if (window.__swoopCapture) return;
  window.__swoopCapture = true;

  const MAX_HEIGHT = 60000;      // CSS px; stops infinite feeds
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // two animation frames, but never hang if the tab is throttled
  const settleFrames = () => Promise.race([
    new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    sleep(120),
  ]);

  let st = null;

  function docScroller() { return document.scrollingElement || document.documentElement; }

  function findInnerScroller() {
    const se = docScroller();
    if (se.scrollHeight > innerHeight + 4) return null;      // the document itself scrolls
    let best = null, bestArea = 0;
    for (const el of document.body ? document.body.querySelectorAll('*') : []) {
      if (el.scrollHeight <= el.clientHeight + 4 || el.clientHeight < 120) continue;
      const oy = getComputedStyle(el).overflowY;
      if (oy !== 'auto' && oy !== 'scroll' && oy !== 'overlay') continue;
      const r = el.getBoundingClientRect();
      const w = Math.min(r.right, innerWidth) - Math.max(r.left, 0);
      const h = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
      if (w <= 0 || h <= 0) continue;
      if (w * h > bestArea) { bestArea = w * h; best = el; }
    }
    return best && bestArea > innerWidth * innerHeight * 0.25 ? best : null;
  }

  function getY() { return st.scroller ? st.scroller.scrollTop : window.scrollY; }
  function setY(y) {
    if (st.scroller) st.scroller.scrollTop = y;
    else window.scrollTo(window.scrollX, y);
  }
  function scrollHeight() { return st.scroller ? st.scroller.scrollHeight : docScroller().scrollHeight; }
  function viewHeight() { return st.scroller ? st.scroller.clientHeight : innerHeight; }

  function setImportant(el, prop, value) {
    st.inline.push([el, prop, el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)]);
    el.style.setProperty(prop, value, 'important');
  }

  async function preScroll(delay) {
    const step = Math.max(200, Math.round(viewHeight() * 0.85));
    const t0 = Date.now();
    let y = 0;
    while (Date.now() - t0 < 20000) {
      y += step;
      setY(y);
      await sleep(delay);
      const max = scrollHeight() - viewHeight();
      if (y >= max) {
        await sleep(350);   // a feed may load more
        if (y >= scrollHeight() - viewHeight()) break;
      }
      if (y >= MAX_HEIGHT) break;
    }
    setY(0);
    await settleFrames();
    await sleep(400);
  }

  // wait for CSS animations and transitions that will end (fade-ins, slide-ins), never for endless ones
  async function waitForAnimations(limit) {
    if (!document.getAnimations) return;
    const t0 = Date.now();
    while (Date.now() - t0 < limit) {
      const running = document.getAnimations().filter((a) => {
        if (a.playState !== 'running') return false;
        const t = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null;
        return t && Number.isFinite(t.endTime) && t.endTime < 8000;
      });
      if (!running.length) return;
      await Promise.race([Promise.all(running.map((a) => a.finished.catch(() => {}))), sleep(limit - (Date.now() - t0))]);
      await settleFrames();
    }
  }

  async function waitForImages(limit) {
    const pending = Array.from(document.images).filter((img) => !img.complete && img.loading !== 'lazy');
    const fonts = document.fonts ? document.fonts.ready : Promise.resolve();
    await Promise.race([
      Promise.all([fonts, ...pending.map((img) => new Promise((r) => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }); }))]),
      sleep(limit),
    ]);
  }

  function sortFixed() {
    // sticky elements go back to their place in the page so they appear once;
    // fixed ones are shown only in the first screen (headers) or the last (bars at the bottom)
    st.fixed = [];
    if (st.scroller) return;
    const vw = innerWidth, vh = innerHeight;
    for (const el of document.body ? document.body.querySelectorAll('*') : []) {
      const cs = getComputedStyle(el);
      if (cs.position === 'sticky' || cs.position === '-webkit-sticky') {
        setImportant(el, 'position', 'relative');
        for (const p of ['top', 'bottom', 'left', 'right']) setImportant(el, p, 'auto');
      } else if (cs.position === 'fixed') {
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        let where = 'top';
        if (r.width >= vw * 0.9 && r.height >= vh * 0.9) where = 'all';   // a fixed background
        else if (r.top >= vh / 2) where = 'bottom';
        st.fixed.push({ el, where, vis: el.style.getPropertyValue('visibility'), prio: el.style.getPropertyPriority('visibility') });
      }
    }
  }

  function showFixed(index, total) {
    for (const f of st.fixed) {
      const show = f.where === 'all' || (f.where === 'top' && index === 0) || (f.where === 'bottom' && index === total - 1);
      if (show) {
        if (f.vis) f.el.style.setProperty('visibility', f.vis, f.prio);
        else f.el.style.removeProperty('visibility');
      } else f.el.style.setProperty('visibility', 'hidden', 'important');
    }
  }

  async function prepare(opt) {
    if (st) restore();
    st = { x: window.scrollX, y: window.scrollY, inline: [], fixed: [], scroller: null, innerY: 0 };
    st.style = document.createElement('style');
    st.style.textContent =
      'html,body,[data-swoop-scroller]{scroll-behavior:auto!important;scroll-snap-type:none!important;scrollbar-width:none!important}' +
      'html::-webkit-scrollbar,body::-webkit-scrollbar,[data-swoop-scroller]::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}';
    (document.head || document.documentElement).appendChild(st.style);
    await settleFrames();

    st.scroller = findInnerScroller();
    if (st.scroller) {
      st.scroller.setAttribute('data-swoop-scroller', '');
      st.innerY = st.scroller.scrollTop;
      await settleFrames();
    }
    if (opt.preScroll) await preScroll(opt.preScrollDelay || 120);
    else { setY(0); await settleFrames(); }

    if (opt.hideFixed !== false) sortFixed();
    await waitForImages(2500);
    await waitForAnimations(3000);
    await settleFrames();

    const full = scrollHeight();
    const vh = viewHeight();
    let band = { top: 0, height: innerHeight };
    if (st.scroller) {
      const r = st.scroller.getBoundingClientRect();
      band = { top: Math.max(0, Math.round(r.top)), height: Math.round(Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) };
    }
    return {
      viewportWidth: document.documentElement.clientWidth || innerWidth,
      viewportHeight: innerHeight,
      dpr: window.devicePixelRatio || 1,
      scrollHeight: Math.min(full, MAX_HEIGHT),
      cut: full > MAX_HEIGHT,
      step: vh,
      band,
      inner: !!st.scroller,
      title: document.title,
    };
  }

  async function scrollTo(msg) {
    setY(msg.y);
    showFixed(msg.index, msg.total);
    await settleFrames();
    await sleep(msg.settle || 0);
    await waitForAnimations(1500);
    return { y: getY() };
  }

  function restore() {
    if (!st) return;
    for (const f of st.fixed) {
      if (f.vis) f.el.style.setProperty('visibility', f.vis, f.prio);
      else f.el.style.removeProperty('visibility');
    }
    for (let i = st.inline.length - 1; i >= 0; i--) {
      const [el, prop, value, prio] = st.inline[i];
      if (value) el.style.setProperty(prop, value, prio);
      else el.style.removeProperty(prop);
    }
    if (st.scroller) {
      st.scroller.scrollTop = st.innerY;
      st.scroller.removeAttribute('data-swoop-scroller');
    }
    window.scrollTo(st.x, st.y);
    st.style.remove();
    st = null;
  }

  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (!msg || msg.swoop !== true) return;
    const run = msg.type === 'prepare' ? prepare(msg)
      : msg.type === 'scroll' ? scrollTo(msg)
      : msg.type === 'restore' ? Promise.resolve(restore())
      : null;
    if (!run) return;
    run.then((r) => reply({ ok: true, result: r }), (e) => reply({ ok: false, error: String(e && e.message || e) }));
    return true;
  });
})();
