/* Swoop editor.
   One canvas editor shared by the Chrome extension, the desktop app and the landing page demo.
   Plain JavaScript, no dependencies, no build step. tools/sync-editor.mjs copies this folder into
   extension/editor and desktop/ui/editor, so edit it here only.

   const editor = await SwoopEditor.create(root, options)
     layout       'full'    toolbar on top, zoom and pan (extension, landing page)
                  'overlay' picture fills the window at 1:1, drag a region first (desktop)
     image        ImageBitmap | HTMLImageElement | HTMLCanvasElement | Blob
     pixelRatio   image pixels per CSS pixel of the source (devicePixelRatio at capture). Default 1.
     name         file name without extension. Default 'swoop'.
     notice       a line of text under the toolbar (full layout)
     keys         'window' (default) or 'focus': listen to the keyboard only while the editor has focus
     tool         the tool to start with (full layout). Default 'arrow'. The overlay always starts on 'select'.
     wheelPan     pan with the mouse wheel (full layout). Default true.
     onSave(blob, fileName, { saveAs })   default: download through <a download>
     onCopy(blob)                         default: navigator.clipboard.write
     onClose()                            overlay: Esc and the close button. Full: adds a close button.
   editor.setImage(image, { pixelRatio, name, notice }) -> Promise
   editor.setName(name)  the file name for the next save or copy, without extension
   editor.toBlob(type = 'image/png', quality = 0.92) -> Promise<Blob>
   editor.reset()      forget shapes and selection (overlay: ready for the next capture)
   editor.destroy()
*/
(function (global) {
  'use strict';

  const FONT = 'Geist, ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif';
  const TILE = 4096;               // tall pictures are kept as tiles, never one giant texture
  const HANDLE = 9;                // crop handle size, CSS px
  const MIN_SHAPE = 3;             // drags shorter than this (CSS px) are clicks, not shapes

  const COLORS = [
    { value: '#ff3b30', name: 'Red' },
    { value: '#ff9500', name: 'Orange' },
    { value: '#ffd60a', name: 'Yellow' },
    { value: '#30d158', name: 'Green' },
    { value: '#0a84ff', name: 'Blue' },
    { value: '#ff2d92', name: 'Pink' },
    { value: '#16161a', name: 'Black' },
    { value: '#ffffff', name: 'White' },
  ];
  const SIZES = [
    { value: 's', name: 'Thin' },
    { value: 'm', name: 'Medium' },
    { value: 'l', name: 'Thick' },
  ];
  // CSS px at the source size; multiplied by pixelRatio so a 2x capture gets 2x strokes
  const METRICS = {
    s: { stroke: 2.5, font: 16, radius: 11, marker: 12, block: 8 },
    m: { stroke: 4, font: 22, radius: 14, marker: 18, block: 12 },
    l: { stroke: 7, font: 32, radius: 19, marker: 28, block: 18 },
  };

  const TOOLS = [
    { id: 'select', key: 'v', name: 'Select and move' },
    { id: 'crop', key: 'c', name: 'Crop', full: true },
    { id: 'rect', key: 'r', name: 'Rectangle' },
    { id: 'ellipse', key: 'o', name: 'Ellipse' },
    { id: 'arrow', key: 'a', name: 'Arrow' },
    { id: 'line', key: 'l', name: 'Line' },
    { id: 'pen', key: 'p', name: 'Pen' },
    { id: 'marker', key: 'h', name: 'Highlighter' },
    { id: 'text', key: 't', name: 'Text' },
    { id: 'step', key: 'n', name: 'Numbered step' },
    { id: 'blur', key: 'b', name: 'Blur (pixelate)' },
  ];

  // 20px grid, 1.5px stroke, currentColor
  const ICONS = {
    select: '<path d="M5.5 3.5 15 9.2l-4.3 1.2-2.1 4.1z"/><path d="m10.7 10.4 3.8 4.6"/>',
    crop: '<path d="M6 2.75V14h11.25M2.75 6H14v11.25"/>',
    rect: '<rect x="3.25" y="4.75" width="13.5" height="10.5" rx="1.75"/>',
    ellipse: '<ellipse cx="10" cy="10" rx="6.75" ry="5.25"/>',
    arrow: '<path d="M4.5 15.5 15 5M8.25 4.75H15.25V11.75"/>',
    line: '<path d="M4.5 15.5 15.5 4.5"/>',
    pen: '<path d="m3.75 16.25.9-3.6 8.6-8.6a1.5 1.5 0 0 1 2.1 0l.6.6a1.5 1.5 0 0 1 0 2.1l-8.6 8.6z"/><path d="m11.75 5.5 2.75 2.75"/>',
    marker: '<path d="m7.25 14.75-2-2 7.9-7.9a1.4 1.4 0 0 1 2 0l0 0a1.4 1.4 0 0 1 0 2z"/><path d="M5.25 12.75 3.5 16.5h3.75l0-1.75M10.5 16.5h6"/>',
    text: '<path d="M4.5 5.75v-2h11v2M10 3.75v12.5M7.5 16.25h5"/>',
    step: '<circle cx="10" cy="10" r="6.75"/><path d="M8.75 8 10.5 7v6"/>',
    blur: '<path d="M3.5 3.5h4v4h-4zM12.5 3.5h4v4h-4zM8 8h4v4H8zM3.5 12.5h4v4h-4zM12.5 12.5h4v4h-4z"/>',
    undo: '<path d="M7.25 4.5 3.75 8l3.5 3.5"/><path d="M3.75 8h8a4.25 4.25 0 0 1 0 8.5H9.5"/>',
    redo: '<path d="m12.75 4.5 3.5 3.5-3.5 3.5"/><path d="M16.25 8h-8a4.25 4.25 0 0 0 0 8.5h2.25"/>',
    copy: '<rect x="7" y="7" width="9.25" height="9.25" rx="2"/><path d="M13 4.75v-.5a1.5 1.5 0 0 0-1.5-1.5h-6.75a1.5 1.5 0 0 0-1.5 1.5V11a1.5 1.5 0 0 0 1.5 1.5h.5"/>',
    save: '<path d="M10 3.5v9M6.25 9 10 12.75 13.75 9M4 16.25h12"/>',
    close: '<path d="m5.5 5.5 9 9M14.5 5.5l-9 9"/>',
    minus: '<path d="M5.5 10h9"/>',
    plus: '<path d="M10 4.5v11M4.5 10h11"/>',
    check: '<path d="m5 10.5 3 3 7-7"/>',
    trash: '<path d="M4 6h12M8.25 6V4.5h3.5V6M5.75 6l.75 10h7l.75-10"/>',
    reset: '<path d="M4.25 10a5.75 5.75 0 1 0 1.7-4.1"/><path d="M4 3.5v3.25h3.25"/>',
  };

  const icon = (name) =>
    '<svg class="se-ico" viewBox="0 0 20 20" aria-hidden="true" focusable="false">' + ICONS[name] + '</svg>';

  /* ------------------------------------------------------------ small helpers */
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');
  let uid = 0;

  const A4 = { w: 595.28, h: 841.89 };   // points

  // A minimal PDF: one page per JPEG, the picture filling the page. No library needed.
  function pdfFromJpegs(pages) {
    const enc = new TextEncoder();
    const parts = [], offsets = [];
    let len = 0;
    const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
    const obj = (id, dict, stream) => {
      offsets[id] = len;
      push(id + ' 0 obj\n' + dict);
      if (stream) { push('\nstream\n'); push(stream); push('\nendstream'); }
      push('\nendobj\n');
    };
    const f = (v) => String(Math.round(v * 100) / 100);
    push(new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 10, 37, 226, 227, 207, 211, 10]));   // %PDF-1.4 and a binary marker
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [' + pages.map((_, i) => (3 + i * 3) + ' 0 R').join(' ') + '] /Count ' + pages.length + ' >>');
    pages.forEach((p, i) => {
      const id = 3 + i * 3;
      obj(id, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + f(p.pw) + ' ' + f(p.ph) + '] /Resources << /XObject << /Im0 ' + (id + 1) + ' 0 R >> >> /Contents ' + (id + 2) + ' 0 R >>');
      obj(id + 1, '<< /Type /XObject /Subtype /Image /Width ' + p.w + ' /Height ' + p.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + p.jpg.length + ' >>', p.jpg);
      const draw = enc.encode('q ' + f(p.pw) + ' 0 0 ' + f(p.ph) + ' 0 0 cm /Im0 Do Q');
      obj(id + 2, '<< /Length ' + draw.length + ' >>', draw);
    });
    const size = 3 + pages.length * 3;
    const xref = len;
    let tail = 'xref\n0 ' + size + '\n0000000000 65535 f \n';
    for (let i = 1; i < size; i++) tail += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    push(tail + 'trailer\n<< /Size ' + size + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    return new Blob(parts, { type: 'application/pdf' });
  }

  function makeCanvas(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function canvasToBlob(c, type, quality) {
    if (c.convertToBlob) return c.convertToBlob({ type, quality });
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode the image'))), type, quality));
  }
  function luminance(hex) {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }
  const norm = (s) => ({
    x: Math.min(s.x1, s.x2), y: Math.min(s.y1, s.y2),
    w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1),
  });
  function distSeg(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
    t = clamp(t, 0, 1);
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }
  function cloneShape(s) {
    const c = Object.assign({}, s);
    delete c._cache; delete c._editing;
    if (s.pts) c.pts = s.pts.slice();
    return c;
  }

  async function toBitmap(image) {
    if (!image) throw new Error('No image');
    if (image instanceof Blob) return createImageBitmap(image);
    if (typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement) {
      if (!image.complete || !image.naturalWidth) await image.decode();
    }
    return image;
  }
  async function makeTiles(img) {
    const w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
    if (h <= TILE) return { w, h, tiles: [{ y: 0, h, src: img }] };
    const tiles = [];
    for (let y = 0; y < h; y += TILE) {
      const th = Math.min(TILE, h - y);
      tiles.push({ y, h: th, src: await createImageBitmap(img, 0, y, w, th) });
    }
    return { w, h, tiles };
  }

  /* ------------------------------------------------------------ drawing shapes (image coordinates) */
  const measureCtx = makeCanvas(1, 1).getContext('2d');

  function textLines(s) { return String(s.text || '').split('\n'); }
  function measureText(s) {
    measureCtx.font = '600 ' + s.fs + 'px ' + FONT;
    const lines = textLines(s);
    s._w = Math.max(s.fs * 0.5, ...lines.map((l) => measureCtx.measureText(l).width));
    s._h = lines.length * s.fs * 1.25;
  }

  function bounds(s) {
    switch (s.type) {
      case 'pen': case 'marker': {
        let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
        for (let i = 0; i < s.pts.length; i += 2) {
          x1 = Math.min(x1, s.pts[i]); x2 = Math.max(x2, s.pts[i]);
          y1 = Math.min(y1, s.pts[i + 1]); y2 = Math.max(y2, s.pts[i + 1]);
        }
        const p = s.lw / 2;
        return { x: x1 - p, y: y1 - p, w: x2 - x1 + s.lw, h: y2 - y1 + s.lw };
      }
      case 'text': measureText(s); return { x: s.x, y: s.y, w: s._w, h: s._h };
      case 'step': return { x: s.x - s.r, y: s.y - s.r, w: s.r * 2, h: s.r * 2 };
      default: {
        const r = norm(s), p = s.lw ? s.lw / 2 : 0;
        return { x: r.x - p, y: r.y - p, w: r.w + p * 2, h: r.h + p * 2 };
      }
    }
  }

  function hitShape(s, x, y, tol) {
    switch (s.type) {
      case 'line': case 'arrow':
        return distSeg(x, y, s.x1, s.y1, s.x2, s.y2) <= tol + s.lw / 2;
      case 'pen': case 'marker': {
        const p = s.pts;
        if (p.length === 2) return Math.hypot(x - p[0], y - p[1]) <= tol + s.lw / 2;
        for (let i = 2; i < p.length; i += 2) {
          if (distSeg(x, y, p[i - 2], p[i - 1], p[i], p[i + 1]) <= tol + s.lw / 2) return true;
        }
        return false;
      }
      case 'step': return Math.hypot(x - s.x, y - s.y) <= s.r + tol;
      default: {
        const b = bounds(s);
        return x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol;
      }
    }
  }

  function moveShape(s, dx, dy) {
    if (s.pts) for (let i = 0; i < s.pts.length; i += 2) { s.pts[i] += dx; s.pts[i + 1] += dy; }
    else if (s.type === 'text' || s.type === 'step') { s.x += dx; s.y += dy; }
    else { s.x1 += dx; s.y1 += dy; s.x2 += dx; s.y2 += dy; }
    delete s._cache;
  }

  function tracePath(ctx, p) {
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    if (p.length === 2) { ctx.lineTo(p[0] + 0.01, p[1]); return; }
    // smooth through the midpoints
    for (let i = 2; i < p.length - 2; i += 2) {
      const mx = (p[i] + p[i + 2]) / 2, my = (p[i + 1] + p[i + 3]) / 2;
      ctx.quadraticCurveTo(p[i], p[i + 1], mx, my);
    }
    ctx.lineTo(p[p.length - 2], p[p.length - 1]);
  }

  function drawArrow(ctx, s) {
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) return;
    const ux = dx / len, uy = dy / len;
    const head = Math.min(len * 0.55, s.lw * 3.2 + 8);
    const half = head * 0.62;
    const bx = s.x2 - ux * head, by = s.y2 - uy * head;
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2 - ux * head * 0.6, s.y2 - uy * head * 0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s.x2, s.y2);
    ctx.lineTo(bx - uy * half, by + ux * half);
    ctx.lineTo(bx + uy * half, by - ux * half);
    ctx.closePath();
    ctx.lineWidth = Math.max(1, s.lw * 0.5);
    ctx.fill();
    ctx.stroke();
  }

  function drawStep(ctx, s, n) {
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, s.r * 0.14);
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.stroke();
    ctx.fillStyle = luminance(s.color) > 0.55 ? '#16161a' : '#ffffff';
    ctx.font = '700 ' + Math.round(s.r * (n > 9 ? 0.95 : 1.15)) + 'px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), s.x, s.y + s.r * 0.06);
  }

  function drawText(ctx, s) {
    ctx.font = '600 ' + s.fs + 'px ' + FONT;
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, s.fs * 0.2);
    ctx.strokeStyle = luminance(s.color) > 0.55 ? 'rgba(10,10,12,0.72)' : 'rgba(255,255,255,0.94)';
    const lines = textLines(s);
    for (let i = 0; i < lines.length; i++) {
      const y = s.y + i * s.fs * 1.25 + s.fs * 0.1;
      ctx.strokeText(lines[i], s.x, y);
      ctx.fillText(lines[i], s.x, y);
    }
  }

  /* ------------------------------------------------------------ the editor */
  async function create(root, options) {
    const opt = Object.assign({ layout: 'full', pixelRatio: 1, name: 'swoop', keys: 'window', wheelPan: true }, options);
    const overlay = opt.layout === 'overlay';

    // document state
    let base = null;                 // { w, h, tiles }
    let pr = opt.pixelRatio || 1;
    let shapes = [];
    let crop = null;                 // { x, y, w, h } in image px
    let past = [], future = [];
    let selected = null;
    // view state: screen = image * s + o (CSS px inside the stage)
    const view = { s: 1, ox: 0, oy: 0, w: 0, h: 0, dpr: 1 };
    let autoFit = true;              // keep fitting on resize until the person zooms or pans
    let tool = overlay ? 'select' : TOOLS.some((t) => t.id === opt.tool) ? opt.tool : 'arrow';
    let color = COLORS[0].value;
    let size = 'm';
    let drag = null;
    let hover = null;                // last pointer position, screen px
    let spaceDown = false;
    let textEdit = null;             // { shape, isNew, before }
    let frame = 0;
    let format = 'png';
    try { const f = localStorage.getItem('swoop-format'); if (f === 'png' || f === 'jpeg' || f === 'webp' || f === 'pdf') format = f; } catch (e) {}

    /* ---------- DOM ---------- */
    root.classList.add('se', overlay ? 'se-overlay' : 'se-full');
    root.innerHTML = '';
    if (opt.keys === 'focus') root.tabIndex = 0;

    const toolButtons = TOOLS.filter((t) => !(overlay && t.full)).map((t) =>
      '<button type="button" class="se-btn se-tool" data-tool="' + t.id + '" aria-pressed="false" aria-label="' + t.name +
      '" data-tip="' + t.name + '" data-key="' + t.key.toUpperCase() + '">' + icon(t.id) + '</button>').join('');
    const swatches = COLORS.map((c) =>
      '<button type="button" class="se-swatch" data-color="' + c.value + '" aria-pressed="false" aria-label="' + c.name +
      '" data-tip="' + c.name + '"></button>').join('');
    const sizes = SIZES.map((z) =>
      '<button type="button" class="se-size-btn" data-size="' + z.value + '" aria-pressed="false" aria-label="' + z.name +
      '" data-tip="' + z.name + '"><span class="se-dot se-dot-' + z.value + '"></span></button>').join('');
    const mod = isMac ? '⌘' : 'Ctrl+';

    const bar =
      '<div class="se-bar" role="toolbar" aria-label="Screenshot editor">' +
        '<div class="se-bar-scroll">' +
        '<div class="se-group" role="group" aria-label="Tools">' + toolButtons + '</div>' +
        (overlay
          ? '<div class="se-group"><button type="button" class="se-btn se-style-btn" aria-haspopup="true" aria-expanded="false" aria-label="Colour and size" data-tip="Colour and size"><span class="se-style-dot"></span></button></div>'
          : '<div class="se-group se-swatches" role="group" aria-label="Colour">' + swatches + '</div>' +
            '<div class="se-group se-sizes" role="group" aria-label="Size">' + sizes + '</div>') +
        '<div class="se-group" role="group" aria-label="History">' +
          '<button type="button" class="se-btn" data-act="undo" aria-label="Undo" data-tip="Undo" data-key="' + mod + 'Z">' + icon('undo') + '</button>' +
          '<button type="button" class="se-btn" data-act="redo" aria-label="Redo" data-tip="Redo" data-key="' + mod + 'Shift+Z">' + icon('redo') + '</button>' +
          '<button type="button" class="se-btn" data-act="delete" aria-label="Delete the selected mark" data-tip="Delete" data-key="Del" hidden>' + icon('trash') + '</button>' +
        '</div>' +
        (overlay ? '' :
          '<span class="se-spacer"></span>' +
          '<div class="se-group se-zoom" role="group" aria-label="Zoom">' +
            '<button type="button" class="se-btn" data-act="zoom-out" aria-label="Zoom out" data-tip="Zoom out" data-key="' + mod + '−">' + icon('minus') + '</button>' +
            '<button type="button" class="se-zoom-val num" data-act="fit" aria-label="Fit to the window" data-tip="Fit to the window" data-key="' + mod + '0">100%</button>' +
            '<button type="button" class="se-btn" data-act="zoom-in" aria-label="Zoom in" data-tip="Zoom in" data-key="' + mod + '+">' + icon('plus') + '</button>' +
          '</div>') +
        '</div>' +
        '<div class="se-group se-actions">' +
          '<button type="button" class="se-btn se-act" data-act="copy" aria-label="Copy to the clipboard" data-tip="Copy" data-key="' + mod + 'C">' + icon('copy') + '<span class="se-label">Copy</span></button>' +
          (overlay ? '' :
            '<label class="se-format"><span class="vh">Format</span><select data-act="format" aria-label="Save as">' +
              '<option value="png">PNG</option><option value="jpeg">JPG</option><option value="webp">WebP</option><option value="pdf">PDF</option></select></label>') +
          '<button type="button" class="se-btn se-act se-primary" data-act="save" aria-label="Save" data-tip="Save" data-key="' + mod + 'S">' + icon('save') + '<span class="se-label">Save</span></button>' +
          (overlay || opt.onClose ? '<button type="button" class="se-btn" data-act="close" aria-label="Close" data-tip="Close" data-key="Esc">' + icon('close') + '</button>' : '') +
        '</div>' +
      '</div>';

    root.innerHTML =
      (overlay ? '' : bar + '<p class="se-notice" hidden></p>') +
      '<div class="se-stage"><canvas class="se-canvas" role="img" aria-label="Screenshot"></canvas>' +
        '<textarea class="se-text" rows="1" spellcheck="false" aria-label="Text" hidden></textarea>' +
        (overlay ? '<div class="se-readout num" aria-hidden="true" hidden></div>' +
          '<p class="se-hint">Drag to select an area. <kbd>Esc</kbd> to cancel.</p>' + bar +
          '<div class="se-pop" hidden><div class="se-swatches" role="group" aria-label="Colour">' + swatches + '</div>' +
          '<div class="se-sizes" role="group" aria-label="Size">' + sizes + '</div></div>' : '') +
      '</div>' +
      '<div class="se-tip" role="tooltip" hidden></div>' +
      '<div class="se-menu" role="menu" aria-label="Screenshot actions" hidden></div>' +
      '<div class="se-toast" role="status" aria-live="polite"></div>';

    const $ = (s) => root.querySelector(s);
    const $$ = (s) => Array.from(root.querySelectorAll(s));
    const stage = $('.se-stage');
    const canvas = $('.se-canvas');
    const ctx = canvas.getContext('2d');
    const textarea = $('.se-text');
    const barEl = $('.se-bar');
    const tipEl = $('.se-tip');
    const toastEl = $('.se-toast');
    const notice = $('.se-notice');
    const readout = $('.se-readout');
    const hint = $('.se-hint');
    const pop = $('.se-pop');
    const zoomVal = $('.se-zoom-val');
    const formatSel = $('select[data-act="format"]');
    if (formatSel) formatSel.value = format;
    // swatch colours are set here, not in style="" attributes, which a strict CSP (the desktop app) blocks
    $$('.se-swatch').forEach((b) => b.style.setProperty('--c', b.dataset.color));

    /* ---------- state helpers ---------- */
    const snapshot = () => ({ shapes: shapes.map(cloneShape), crop: crop && Object.assign({}, crop) });
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    function commit(before) {
      if (same(before, snapshot())) return;
      past.push(before);
      if (past.length > 200) past.shift();
      future = [];
      syncUi();
    }
    function restore(st) {
      shapes = st.shapes.map(cloneShape);
      crop = st.crop && Object.assign({}, st.crop);
      selected = null;
      syncUi();
      render();
    }
    function undo() { if (textEdit) finishText(false); if (!past.length) return; future.push(snapshot()); restore(past.pop()); }
    function redo() { if (!future.length) return; past.push(snapshot()); restore(future.pop()); }

    const m = (k) => METRICS[size][k] * pr;
    const imgRect = () => crop ? cropClamped() : { x: 0, y: 0, w: base.w, h: base.h };
    function cropClamped() {
      const x = clamp(Math.round(crop.x), 0, base.w), y = clamp(Math.round(crop.y), 0, base.h);
      return { x, y, w: clamp(Math.round(crop.x + crop.w), 0, base.w) - x, h: clamp(Math.round(crop.y + crop.h), 0, base.h) - y };
    }

    /* ---------- base picture ---------- */
    function drawBase(c, sx, sy, sw, sh, dx, dy, dw, dh, snap) {
      const ky = dh / sh;
      for (const t of base.tiles) {
        const y0 = Math.max(sy, t.y), y1 = Math.min(sy + sh, t.y + t.h);
        if (y1 <= y0) continue;
        let ty = dy + (y0 - sy) * ky, tb = dy + (y1 - sy) * ky;
        if (snap) { ty = Math.round(ty); tb = Math.round(tb); }
        c.drawImage(t.src, sx, y0 - t.y, sw, y1 - y0, dx, ty, dw, tb - ty);
      }
    }
    function drawPixelate(c, s) {
      const r0 = norm(s);
      const x = clamp(Math.floor(r0.x), 0, base.w), y = clamp(Math.floor(r0.y), 0, base.h);
      const w = clamp(Math.ceil(r0.x + r0.w), 0, base.w) - x, h = clamp(Math.ceil(r0.y + r0.h), 0, base.h) - y;
      if (w < 1 || h < 1) return;
      const key = x + ',' + y + ',' + w + ',' + h + ',' + s.block;
      if (!s._cache || s._cache.key !== key) {
        const cw = Math.max(1, Math.ceil(w / s.block)), ch = Math.max(1, Math.ceil(h / s.block));
        const small = makeCanvas(cw, ch);
        const sc = small.getContext('2d');
        sc.imageSmoothingEnabled = true;
        sc.imageSmoothingQuality = 'medium';
        drawBase(sc, x, y, w, h, 0, 0, cw, ch, false);
        s._cache = { key, small };
      }
      c.save();
      c.imageSmoothingEnabled = false;
      c.drawImage(s._cache.small, x, y, w, h);
      c.restore();
    }

    function stepNumber(s) {
      let n = 0;
      for (const o of shapes) { if (o.type === 'step') n++; if (o === s) return n; }
      return n;
    }
    function drawShape(c, s) {
      if (s._editing) return;
      c.save();
      c.strokeStyle = c.fillStyle = s.color;
      c.lineWidth = s.lw || 1;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      switch (s.type) {
        case 'rect': {
          const r = norm(s);
          c.beginPath();
          c.roundRect(r.x, r.y, r.w, r.h, Math.min(s.lw * 1.2, r.w / 2, r.h / 2));
          c.stroke();
          break;
        }
        case 'ellipse': {
          const r = norm(s);
          c.beginPath();
          c.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
          c.stroke();
          break;
        }
        case 'line':
          c.beginPath(); c.moveTo(s.x1, s.y1); c.lineTo(s.x2, s.y2); c.stroke();
          break;
        case 'arrow': drawArrow(c, s); break;
        case 'pen': tracePath(c, s.pts); c.stroke(); break;
        case 'marker':
          c.globalCompositeOperation = 'multiply';
          c.globalAlpha = 0.5;
          c.lineCap = 'butt';
          tracePath(c, s.pts); c.stroke();
          break;
        case 'text': drawText(c, s); break;
        case 'step': drawStep(c, s, stepNumber(s)); break;
        case 'blur': drawPixelate(c, s); break;
      }
      c.restore();
    }

    /* ---------- view ---------- */
    function resize() {
      const r = stage.getBoundingClientRect();
      view.w = Math.max(1, r.width); view.h = Math.max(1, r.height);
      view.dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(view.w * view.dpr);
      canvas.height = Math.round(view.h * view.dpr);
      canvas.style.width = view.w + 'px';
      canvas.style.height = view.h + 'px';
      if (overlay && base) { view.s = view.w / base.w; view.ox = 0; view.oy = 0; }
      else if (autoFit) fit(fitMode);
      else clampView();
      render();
    }
    const MARGIN = 32;
    function clampView() {
      if (!base || overlay) return;
      const iw = base.w * view.s, ih = base.h * view.s;
      view.ox = iw <= view.w - MARGIN * 2 ? (view.w - iw) / 2 : clamp(view.ox, view.w - iw - MARGIN, MARGIN);
      view.oy = ih <= view.h - MARGIN * 2 ? (view.h - ih) / 2 : clamp(view.oy, view.h - ih - MARGIN, MARGIN);
      if (zoomVal) zoomVal.textContent = Math.round(view.s * pr * 100) + '%';
    }
    let fitMode;
    function fit(mode) {
      if (!base || overlay) return;
      autoFit = true;
      fitMode = mode;
      const aw = Math.max(40, view.w - MARGIN * 2), ah = Math.max(40, view.h - MARGIN * 2);
      const actual = 1 / pr;
      const tall = base.h / base.w > (ah / aw) * 1.6;
      let s = mode === 'actual' ? actual : tall ? aw / base.w : Math.min(aw / base.w, ah / base.h);
      if (mode !== 'actual') s = Math.min(s, actual);
      view.s = s;
      view.ox = (view.w - base.w * s) / 2;
      view.oy = MARGIN;
      clampView();
      render();
    }
    function zoomAt(ns, cx, cy) {
      if (overlay || !base) return;
      ns = clamp(ns, 0.02, 8);
      autoFit = false;
      const ix = (cx - view.ox) / view.s, iy = (cy - view.oy) / view.s;
      view.s = ns;
      view.ox = cx - ix * ns;
      view.oy = cy - iy * ns;
      clampView();
      positionText();
      render();
    }
    const toImg = (sx, sy) => ({ x: (sx - view.ox) / view.s, y: (sy - view.oy) / view.s });
    const toScreen = (ix, iy) => ({ x: ix * view.s + view.ox, y: iy * view.s + view.oy });
    function localPoint(e) {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    /* ---------- render ---------- */
    function render() {
      if (frame) return;
      frame = requestAnimationFrame(paint);
    }
    function paint() {
      frame = 0;
      const d = view.dpr;
      const cs = getComputedStyle(root);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = cs.getPropertyValue('--se-stage').trim() || '#1b1b1e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (!base) return;

      // visible part of the picture, drawn in device pixels so tile seams stay sharp
      const v0 = toImg(0, 0), v1 = toImg(view.w, view.h);
      const sx = clamp(Math.floor(v0.x), 0, base.w), sy = clamp(Math.floor(v0.y), 0, base.h);
      const ex = clamp(Math.ceil(v1.x), 0, base.w), ey = clamp(Math.ceil(v1.y), 0, base.h);
      if (ex > sx && ey > sy) {
        ctx.imageSmoothingEnabled = view.s * d < 2;
        ctx.imageSmoothingQuality = 'high';
        const p = toScreen(sx, sy);
        drawBase(ctx, sx, sy, ex - sx, ey - sy, p.x * d, p.y * d, (ex - sx) * view.s * d, (ey - sy) * view.s * d, true);
      }

      // marks
      ctx.setTransform(view.s * d, 0, 0, view.s * d, view.ox * d, view.oy * d);
      ctx.imageSmoothingEnabled = true;
      for (const s of shapes) drawShape(ctx, s);

      // selection outline
      ctx.setTransform(d, 0, 0, d, 0, 0);
      const accent = cs.getPropertyValue('--se-accent').trim() || '#ff5a1f';
      if (selected && shapes.includes(selected) && !selected._editing) {
        const b = bounds(selected);
        const a = toScreen(b.x, b.y);
        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1.25;
        ctx.strokeStyle = accent;
        ctx.strokeRect(Math.round(a.x - 4) + 0.5, Math.round(a.y - 4) + 0.5, Math.round(b.w * view.s + 8), Math.round(b.h * view.s + 8));
        ctx.restore();
      }

      // crop or selection region
      const showCrop = overlay || tool === 'crop' || crop;
      if (showCrop) {
        const scrim = overlay ? 'rgba(0,0,0,0.5)' : tool === 'crop' ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.72)';
        ctx.save();
        ctx.fillStyle = scrim;
        ctx.beginPath();
        if (overlay) ctx.rect(0, 0, view.w, view.h);
        else {
          const a = toScreen(0, 0);
          ctx.rect(a.x, a.y, base.w * view.s, base.h * view.s);
        }
        if (crop) {
          const r = cropScreen();
          ctx.rect(r.x, r.y, r.w, r.h);
        }
        ctx.fill('evenodd');
        if (crop) {
          const r = cropScreen();
          ctx.strokeStyle = accent;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(Math.round(r.x) - 0.25, Math.round(r.y) - 0.25, Math.round(r.w) + 0.5, Math.round(r.h) + 0.5);
          if (overlay || tool === 'crop') {
            for (const h of handles(r)) {
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(h.x - HANDLE / 2, h.y - HANDLE / 2, HANDLE, HANDLE);
              ctx.strokeStyle = accent;
              ctx.lineWidth = 1.5;
              ctx.strokeRect(h.x - HANDLE / 2, h.y - HANDLE / 2, HANDLE, HANDLE);
            }
          }
        }
        // guides while choosing the first region
        if (overlay && !crop && hover && !drag) {
          ctx.strokeStyle = 'rgba(255,255,255,0.55)';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(0, Math.round(hover.y) + 0.5); ctx.lineTo(view.w, Math.round(hover.y) + 0.5);
          ctx.moveTo(Math.round(hover.x) + 0.5, 0); ctx.lineTo(Math.round(hover.x) + 0.5, view.h);
          ctx.stroke();
        }
        ctx.restore();
      }
      if (overlay) placeOverlayUi();
    }

    /* ---------- crop / selection region ---------- */
    function cropScreen() {
      const a = toScreen(crop.x, crop.y);
      return { x: a.x, y: a.y, w: crop.w * view.s, h: crop.h * view.s };
    }
    function handles(r) {
      const xs = [r.x, r.x + r.w / 2, r.x + r.w], ys = [r.y, r.y + r.h / 2, r.y + r.h];
      return [
        { id: 'nw', x: xs[0], y: ys[0] }, { id: 'n', x: xs[1], y: ys[0] }, { id: 'ne', x: xs[2], y: ys[0] },
        { id: 'e', x: xs[2], y: ys[1] }, { id: 'se', x: xs[2], y: ys[2] }, { id: 's', x: xs[1], y: ys[2] },
        { id: 'sw', x: xs[0], y: ys[2] }, { id: 'w', x: xs[0], y: ys[1] },
      ];
    }
    function handleAt(p) {
      if (!crop || !(overlay || tool === 'crop')) return null;
      const reach = HANDLE + (matchMedia('(pointer: coarse)').matches ? 10 : 3);
      for (const h of handles(cropScreen())) if (Math.abs(p.x - h.x) <= reach && Math.abs(p.y - h.y) <= reach) return h.id;
      return null;
    }
    function insideCrop(ip) {
      return crop && ip.x >= crop.x && ip.x <= crop.x + crop.w && ip.y >= crop.y && ip.y <= crop.y + crop.h;
    }
    function clampToImage(p) { return { x: clamp(p.x, 0, base.w), y: clamp(p.y, 0, base.h) }; }
    function rectFrom(a, b) {
      return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
    }
    const CURSORS = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };

    /* ---------- overlay chrome: toolbar and size readout follow the selection ---------- */
    function placeOverlayUi() {
      const has = !!crop && !(drag && (drag.kind === 'crop-new'));
      barEl.hidden = !crop || (drag && drag.kind === 'crop-new');
      hint.hidden = !!crop || !!drag;
      if (crop || (drag && drag.kind === 'crop-new')) {
        const r = crop ? cropScreen() : null;
        if (r) {
          readout.hidden = false;
          const c = cropClamped();
          readout.textContent = c.w + ' × ' + c.h;
          const ry = r.y - 28 >= 4 ? r.y - 28 : r.y + 6;
          readout.style.transform = 'translate(' + Math.round(clamp(r.x, 4, view.w - 120)) + 'px,' + Math.round(ry) + 'px)';
        }
      } else readout.hidden = true;
      if (!has) { pop.hidden = true; return; }
      const r = cropScreen();
      const bw = barEl.offsetWidth, bh = barEl.offsetHeight, gap = 10;
      let top = r.y + r.h + gap;
      if (top + bh > view.h - 8) top = r.y - gap - bh;
      if (top < 8) top = Math.min(view.h - bh - 8, r.y + r.h - bh - gap);
      const left = clamp(r.x + r.w - bw, 8, Math.max(8, view.w - bw - 8));
      barEl.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(top) + 'px)';
      if (!pop.hidden) placePop();
    }
    function placePop() {
      const btn = $('.se-style-btn');
      const b = btn.getBoundingClientRect(), s = stage.getBoundingClientRect();
      const pw = pop.offsetWidth, ph = pop.offsetHeight;
      let top = b.top - s.top - ph - 8;
      if (top < 8) top = b.bottom - s.top + 8;
      const left = clamp(b.left - s.left + b.width / 2 - pw / 2, 8, view.w - pw - 8);
      pop.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(top) + 'px)';
    }

    /* ---------- toolbar state ---------- */
    function syncUi() {
      $$('.se-tool').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === tool)));
      $$('.se-swatch').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.color === color)));
      $$('.se-size-btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.size === size)));
      const dot = $('.se-style-dot');
      if (dot) { dot.style.setProperty('--c', color); dot.dataset.size = size; }
      const u = $('[data-act="undo"]'), r = $('[data-act="redo"]'), del = $('[data-act="delete"]');
      if (u) u.disabled = !past.length;
      if (r) r.disabled = !future.length;
      if (del) del.hidden = !selected;
      stage.dataset.tool = tool;
      updateCursor();
    }
    function setTool(id) {
      if (textEdit) finishText(true);
      if (overlay && id === 'crop') id = 'select';
      tool = id;
      if (id !== 'select') selected = null;
      syncUi();
      render();
    }
    function applyStyleToSelected(fn) {
      if (!selected) return;
      const before = snapshot();
      fn(selected);
      delete selected._cache;
      commit(before);
      render();
    }
    function setColor(c) {
      color = c;
      applyStyleToSelected((s) => { if (s.type !== 'blur') s.color = c; });
      syncUi();
    }
    function setSize(z) {
      size = z;
      applyStyleToSelected((s) => {
        if (s.type === 'text') s.fs = m('font');
        else if (s.type === 'step') s.r = m('radius');
        else if (s.type === 'marker') s.lw = m('marker');
        else if (s.type === 'blur') s.block = m('block');
        else s.lw = m('stroke');
      });
      syncUi();
    }

    function updateCursor() {
      let c = 'default';
      if (drag && drag.kind === 'pan') c = 'grabbing';
      else if (spaceDown) c = 'grab';
      else if (hover && base) {
        const h = handleAt(hover);
        const ip = toImg(hover.x, hover.y);
        if (h) c = CURSORS[h];
        else if (overlay && !crop) c = 'crosshair';
        else if (tool === 'select') {
          if (shapes.some((s) => hitShape(s, ip.x, ip.y, 4 / view.s))) c = 'move';
          else if (overlay && insideCrop(ip)) c = 'move';
          else c = overlay ? 'crosshair' : 'grab';
        } else if (tool === 'crop') c = insideCrop(ip) ? 'move' : 'crosshair';
        else if (tool === 'text') c = 'text';
        else c = 'crosshair';
      }
      canvas.style.cursor = c;
    }

    /* ---------- text ---------- */
    function startText(ip, existing) {
      const before = snapshot();
      let s = existing;
      if (!s) {
        s = { id: ++uid, type: 'text', color, x: ip.x, y: ip.y, fs: m('font'), text: '' };
        shapes.push(s);
      }
      s._editing = true;
      textEdit = { shape: s, isNew: !existing, before, old: s.text };
      textarea.value = s.text;
      textarea.hidden = false;
      positionText();
      render();
      textarea.focus({ preventScroll: true });
      textarea.select();
    }
    function positionText() {
      if (!textEdit) return;
      const s = textEdit.shape;
      const p = toScreen(s.x, s.y);
      const fs = s.fs * view.s;
      textarea.style.font = '600 ' + fs + 'px ' + FONT;
      textarea.style.lineHeight = '1.25';
      textarea.style.color = s.color;
      textarea.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px)';
      textarea.style.height = 'auto';
      textarea.style.width = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
      measureCtx.font = '600 ' + fs + 'px ' + FONT;
      const longest = Math.max(fs, ...textarea.value.split('\n').map((l) => measureCtx.measureText(l).width));
      textarea.style.width = Math.ceil(longest + fs * 1.2) + 'px';
    }
    function finishText(keep) {
      if (!textEdit) return;
      const { shape, isNew, before, old } = textEdit;
      textEdit = null;
      delete shape._editing;
      textarea.hidden = true;
      if (keep) shape.text = textarea.value.replace(/\s+$/, '');
      else shape.text = old;
      if (!shape.text) shapes = shapes.filter((s) => s !== shape);
      else if (isNew || keep) selected = tool === 'select' ? shape : null;
      commit(before);
      render();
      if (opt.keys === 'focus') root.focus({ preventScroll: true });
    }
    textarea.addEventListener('input', positionText);
    textarea.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finishText(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finishText(false); }
    });
    textarea.addEventListener('blur', () => finishText(true));

    /* ---------- pointer ---------- */
    function onDown(e) {
      if (!base) return;
      hideTip();
      if (pop && !pop.hidden) { togglePop(false); }
      if (textEdit) { finishText(true); return; }
      const p = localPoint(e);
      const ip = toImg(p.x, p.y);
      hover = p;
      if (e.button === 2) {
        if (overlay && !crop) close();
        return;
      }
      if (e.button === 1 || spaceDown) {
        if (!overlay) { e.preventDefault(); startDrag(e, { kind: 'pan', sx: p.x, sy: p.y, ox: view.ox, oy: view.oy }); }
        return;
      }
      if (e.button !== 0) return;
      const before = snapshot();

      const h = handleAt(p);
      if (h) return startDrag(e, { kind: 'crop-resize', h, start: Object.assign({}, crop), before });

      if (overlay && !crop) return startDrag(e, { kind: 'crop-new', a: clampToImage(ip), before });

      if (tool === 'crop') {
        if (insideCrop(ip)) return startDrag(e, { kind: 'crop-move', last: ip, before });
        return startDrag(e, { kind: 'crop-new', a: clampToImage(ip), before });
      }

      if (tool === 'select') {
        const tol = 4 / view.s;
        const hit = [...shapes].reverse().find((s) => hitShape(s, ip.x, ip.y, tol));
        if (hit) {
          selected = hit;
          syncUi();
          render();
          if (e.detail === 2 && hit.type === 'text') { startText(null, hit); return; }
          return startDrag(e, { kind: 'move', last: ip, before });
        }
        selected = null;
        syncUi();
        if (overlay) {
          if (insideCrop(ip)) return startDrag(e, { kind: 'crop-move', last: ip, before });
          return startDrag(e, { kind: 'crop-new', a: clampToImage(ip), before });
        }
        return startDrag(e, { kind: 'pan', sx: p.x, sy: p.y, ox: view.ox, oy: view.oy });
      }

      if (tool === 'text') {
        const hit = [...shapes].reverse().find((s) => s.type === 'text' && hitShape(s, ip.x, ip.y, 4 / view.s));
        e.preventDefault();
        startText(ip, hit || null);
        return;
      }
      if (tool === 'step') {
        shapes.push({ id: ++uid, type: 'step', color, x: ip.x, y: ip.y, r: m('radius') });
        commit(before);
        render();
        return;
      }

      let s;
      if (tool === 'pen' || tool === 'marker') {
        s = { id: ++uid, type: tool, color, lw: tool === 'marker' ? m('marker') : m('stroke'), pts: [ip.x, ip.y] };
      } else if (tool === 'blur') {
        s = { id: ++uid, type: 'blur', block: m('block'), x1: ip.x, y1: ip.y, x2: ip.x, y2: ip.y };
      } else {
        s = { id: ++uid, type: tool, color, lw: m('stroke'), x1: ip.x, y1: ip.y, x2: ip.x, y2: ip.y };
      }
      shapes.push(s);
      startDrag(e, { kind: 'draw', shape: s, start: p, before });
    }

    function startDrag(e, d) {
      drag = d;
      canvas.setPointerCapture(e.pointerId);
      updateCursor();
      render();
    }

    function onMove(e) {
      if (!base) return;
      const p = localPoint(e);
      hover = p;
      if (!drag) { updateCursor(); if (overlay && !crop) render(); return; }
      const ip = toImg(p.x, p.y);
      switch (drag.kind) {
        case 'pan':
          autoFit = false;
          view.ox = drag.ox + (p.x - drag.sx);
          view.oy = drag.oy + (p.y - drag.sy);
          clampView();
          break;
        case 'crop-new': {
          const b = clampToImage(ip);
          const r = rectFrom(drag.a, b);
          crop = r.w * view.s >= 2 || r.h * view.s >= 2 ? r : null;
          break;
        }
        case 'crop-move': {
          const dx = ip.x - drag.last.x, dy = ip.y - drag.last.y;
          crop.x = clamp(crop.x + dx, 0, base.w - crop.w);
          crop.y = clamp(crop.y + dy, 0, base.h - crop.h);
          drag.last = ip;
          break;
        }
        case 'crop-resize': {
          const st = drag.start, q = clampToImage(ip);
          let x1 = st.x, y1 = st.y, x2 = st.x + st.w, y2 = st.y + st.h;
          if (drag.h.includes('w')) x1 = q.x;
          if (drag.h.includes('e')) x2 = q.x;
          if (drag.h.includes('n')) y1 = q.y;
          if (drag.h.includes('s')) y2 = q.y;
          crop = rectFrom({ x: x1, y: y1 }, { x: x2, y: y2 });
          break;
        }
        case 'move': {
          const dx = ip.x - drag.last.x, dy = ip.y - drag.last.y;
          moveShape(selected, dx, dy);
          drag.last = ip;
          break;
        }
        case 'draw': {
          const s = drag.shape;
          if (s.pts) {
            const lx = s.pts[s.pts.length - 2], ly = s.pts[s.pts.length - 1];
            if (Math.hypot(ip.x - lx, ip.y - ly) * view.s >= 1.5) s.pts.push(ip.x, ip.y);
          } else {
            let x = ip.x, y = ip.y;
            if (e.shiftKey) {
              const dx = x - s.x1, dy = y - s.y1;
              if (s.type === 'line' || s.type === 'arrow') {
                const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
                const len = Math.hypot(dx, dy);
                x = s.x1 + Math.cos(ang) * len; y = s.y1 + Math.sin(ang) * len;
              } else {
                const k = Math.max(Math.abs(dx), Math.abs(dy));
                x = s.x1 + Math.sign(dx || 1) * k; y = s.y1 + Math.sign(dy || 1) * k;
              }
            }
            s.x2 = x; s.y2 = y;
            delete s._cache;
          }
          break;
        }
      }
      render();
    }

    function onUp(e) {
      if (!drag) return;
      const d = drag;
      drag = null;
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
      if (d.kind === 'draw') {
        const s = d.shape, p = localPoint(e);
        const moved = Math.hypot(p.x - d.start.x, p.y - d.start.y);
        if (moved < MIN_SHAPE && !(s.pts && s.type === 'pen')) shapes = shapes.filter((o) => o !== s);
        else if (s.type === 'blur') { const r = norm(s); s.x1 = r.x; s.y1 = r.y; s.x2 = r.x + r.w; s.y2 = r.y + r.h; }
      }
      if (d.kind === 'crop-new' || d.kind === 'crop-resize') {
        if (crop && (crop.w * view.s < 4 || crop.h * view.s < 4)) crop = d.kind === 'crop-resize' ? d.start : null;
        if (crop) crop = { x: Math.round(crop.x), y: Math.round(crop.y), w: Math.round(crop.w), h: Math.round(crop.h) };
      }
      if (d.before) commit(d.before);
      syncUi();
      render();
    }

    function onWheel(e) {
      if (!base || overlay) return;
      const p = localPoint(e);
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? view.h : 1;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomAt(view.s * Math.exp(-e.deltaY * unit * 0.0022), p.x, p.y);
        return;
      }
      if (!opt.wheelPan) return;
      e.preventDefault();
      autoFit = false;
      const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
      const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
      view.ox -= dx * unit;
      view.oy -= dy * unit;
      clampView();
      positionText();
      render();
    }

    /* ---------- actions ---------- */
    // the picture with its marks, at full resolution
    function renderCanvas(opaque) {
      const r = imgRect();
      if (r.w < 1 || r.h < 1) throw new Error('The selection is empty');
      const c = makeCanvas(r.w, r.h);
      const x = c.getContext('2d');
      if (opaque) { x.fillStyle = '#ffffff'; x.fillRect(0, 0, r.w, r.h); }
      x.translate(-r.x, -r.y);
      drawBase(x, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h, false);
      for (const s of shapes) drawShape(x, s);
      return c;
    }
    async function toBlob(type, quality) {
      type = type || 'image/png';
      return canvasToBlob(renderCanvas(type === 'image/jpeg'), type, quality == null ? 0.92 : quality);
    }
    // A PDF of A4-wide pages: a tall capture is cut into page-sized slices, each one a JPEG
    async function toPdf() {
      const c = renderCanvas(true);
      const W = c.width, H = c.height;
      const scale = A4.w / W;
      const sliceH = Math.max(1, Math.floor(A4.h / scale));
      const pages = [];
      for (let y = 0; y < H; y += sliceH) {
        const h = Math.min(sliceH, H - y);
        const pc = makeCanvas(W, h);
        pc.getContext('2d').drawImage(c, 0, y, W, h, 0, 0, W, h);
        const jpg = new Uint8Array(await (await canvasToBlob(pc, 'image/jpeg', 0.92)).arrayBuffer());
        pages.push({ jpg, w: W, h, pw: A4.w, ph: h * scale });
      }
      return pdfFromJpegs(pages);
    }

    let toastTimer = 0;
    function toast(msg, bad) {
      toastEl.textContent = msg;
      toastEl.classList.toggle('is-bad', !!bad);
      toastEl.classList.add('is-on');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), 1800);
    }

    async function copy() {
      if (textEdit) finishText(true);
      if (overlay && !crop) return;
      try {
        const blob = await toBlob('image/png');
        if (opt.onCopy) await opt.onCopy(blob);
        else await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        toast('Copied to the clipboard');
      } catch (err) {
        toast('Could not copy: ' + (err && err.message ? err.message : 'the clipboard is not available'), true);
      }
    }
    async function save(saveAs, as) {
      if (textEdit) finishText(true);
      if (overlay && !crop) return;
      const fmt = overlay ? 'png' : as || format;
      const ext = fmt === 'jpeg' ? 'jpg' : fmt;
      try {
        const blob = fmt === 'pdf' ? await toPdf() : await toBlob('image/' + fmt, fmt === 'png' ? undefined : 0.92);
        const fileName = (opt.name || 'swoop') + '.' + ext;
        if (opt.onSave) {
          const res = await opt.onSave(blob, fileName, { saveAs: !!saveAs });
          if (res !== false) toast(typeof res === 'string' ? res : 'Saved');
        } else {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          toast('Saved ' + fileName);
        }
      } catch (err) {
        toast('Could not save: ' + (err && err.message ? err.message : 'unknown error'), true);
      }
    }
    function close() {
      if (textEdit) finishText(false);
      if (opt.onClose) opt.onClose();
    }
    /* ---------- right-click menu ---------- */
    const menu = $('.se-menu');
    function menuItems() {
      const mod = isMac ? '⌘' : 'Ctrl+';
      return [
        { act: 'copy', label: 'Copy', key: mod + 'C' },
        { act: 'save', label: overlay ? 'Save' : 'Save as ' + (format === 'jpeg' ? 'JPG' : format === 'webp' ? 'WebP' : format.toUpperCase()), key: mod + 'S' },
        overlay ? { act: 'save-as', label: 'Save as…', key: mod + 'Shift+S' } : format !== 'pdf' && { act: 'save-pdf', label: 'Save as PDF' },
        '-',
        { act: 'undo', label: 'Undo', key: mod + 'Z', off: !past.length },
        { act: 'redo', label: 'Redo', key: mod + 'Shift+Z', off: !future.length },
        selected && { act: 'delete', label: 'Delete this mark', key: 'Del' },
        '-',
        overlay ? { act: 'close', label: 'Cancel', key: 'Esc' } : { act: 'fit', label: 'Fit to the window', key: mod + '0' },
      ].filter(Boolean);
    }
    function openMenu(x, y) {
      hideTip();
      if (pop && !pop.hidden) togglePop(false);
      menu.innerHTML = '';
      for (const it of menuItems()) {
        if (it === '-') {
          const hr = document.createElement('div');
          hr.className = 'se-menu-sep';
          hr.setAttribute('role', 'separator');
          menu.append(hr);
          continue;
        }
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'se-menu-item';
        b.setAttribute('role', 'menuitem');
        b.dataset.act = it.act;
        b.disabled = !!it.off;
        b.tabIndex = -1;
        b.append(it.label);
        if (it.key) { const k = document.createElement('kbd'); k.textContent = it.key; b.append(k); }
        menu.append(b);
      }
      menu.hidden = false;
      const r = root.getBoundingClientRect();
      const mw = menu.offsetWidth, mh = menu.offsetHeight;
      const left = clamp(x - r.left, 4, r.width - mw - 4);
      const top = y - r.top + mh + 4 > r.height ? y - r.top - mh : y - r.top;
      menu.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(clamp(top, 4, r.height - mh - 4)) + 'px)';
      const first = menu.querySelector('.se-menu-item:not(:disabled)');
      if (first) first.focus({ preventScroll: true });
    }
    function closeMenu(refocus) {
      if (menu.hidden) return;
      menu.hidden = true;
      if (refocus && opt.keys === 'focus') root.focus({ preventScroll: true });
    }
    function onContextMenu(e) {
      e.preventDefault();
      if (!base || textEdit || e.target.closest('.se-bar, .se-pop, .se-menu')) return;
      if (overlay && !crop) return;                 // like Lightshot: right-click before selecting cancels
      const fromKeyboard = e.button !== 2 && !e.clientX && !e.clientY;
      const cr = canvas.getBoundingClientRect();
      const x = fromKeyboard ? cr.left + cr.width / 2 : e.clientX;
      const y = fromKeyboard ? cr.top + cr.height / 2 : e.clientY;
      // right-click on a mark acts on that mark
      const p = localPoint({ clientX: x, clientY: y });
      const ip = toImg(p.x, p.y);
      const hit = [...shapes].reverse().find((s) => hitShape(s, ip.x, ip.y, 4 / view.s));
      if (hit) { selected = hit; syncUi(); render(); }
      openMenu(x, y);
    }
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('.se-menu-item');
      if (!b || b.disabled) return;
      closeMenu(true);
      switch (b.dataset.act) {
        case 'copy': return copy();
        case 'save': return save(false);
        case 'save-as': return save(true);
        case 'save-pdf': return save(false, 'pdf');
        case 'undo': return undo();
        case 'redo': return redo();
        case 'delete': return deleteSelected();
        case 'fit': return fit();
        case 'close': return close();
      }
    });
    menu.addEventListener('keydown', (e) => {
      e.stopPropagation();
      const items = Array.from(menu.querySelectorAll('.se-menu-item:not(:disabled)'));
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = items.length;
        items[(i + (e.key === 'ArrowDown' ? 1 : n - 1) + n) % n].focus();
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        items[e.key === 'Home' ? 0 : items.length - 1].focus();
      } else if (e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault();
        closeMenu(true);
      }
    });
    const onOutside = (e) => { if (!menu.contains(e.target)) closeMenu(false); };
    const onBlur = () => closeMenu(false);
    document.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('blur', onBlur);

    function deleteSelected() {
      if (!selected) return;
      const before = snapshot();
      shapes = shapes.filter((s) => s !== selected);
      selected = null;
      commit(before);
      render();
    }
    function togglePop(show) {
      if (!pop) return;
      pop.hidden = !show;
      const b = $('.se-style-btn');
      if (b) b.setAttribute('aria-expanded', String(show));
      if (show) placePop();
    }

    barEl.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || !barEl.contains(b)) return;
      if (b.dataset.tool) return setTool(b.dataset.tool);
      if (b.dataset.color) return setColor(b.dataset.color);
      if (b.dataset.size) return setSize(b.dataset.size);
      if (b.classList.contains('se-style-btn')) return togglePop(pop.hidden);
      switch (b.dataset.act) {
        case 'undo': return undo();
        case 'redo': return redo();
        case 'delete': return deleteSelected();
        case 'zoom-in': return zoomAt(view.s * 1.25, view.w / 2, view.h / 2);
        case 'zoom-out': return zoomAt(view.s / 1.25, view.w / 2, view.h / 2);
        case 'fit': return fit();
        case 'copy': return copy();
        case 'save': return save(false);
        case 'close': return close();
      }
    });
    if (pop) pop.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.color) setColor(b.dataset.color);
      if (b.dataset.size) setSize(b.dataset.size);
    });
    if (formatSel) formatSel.addEventListener('change', () => {
      format = formatSel.value;
      try { localStorage.setItem('swoop-format', format); } catch (e) {}
    });

    /* ---------- tooltips ---------- */
    let tipTimer = 0;
    function showTip(el) {
      const label = el.dataset.tip;
      if (!label) return;
      tipEl.innerHTML = '';
      tipEl.append(label);
      if (el.dataset.key) { const k = document.createElement('kbd'); k.textContent = el.dataset.key; tipEl.append(k); }
      tipEl.hidden = false;
      const b = el.getBoundingClientRect(), r = root.getBoundingClientRect();
      const tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
      let top = b.bottom - r.top + 8;
      if (b.bottom + th + 12 > window.innerHeight) top = b.top - r.top - th - 8;
      const left = clamp(b.left - r.left + b.width / 2 - tw / 2, 4, r.width - tw - 4);
      tipEl.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(top) + 'px)';
    }
    function hideTip() { clearTimeout(tipTimer); tipEl.hidden = true; }
    root.addEventListener('pointerover', (e) => {
      const el = e.target.closest('[data-tip]');
      clearTimeout(tipTimer);
      if (!el) { tipEl.hidden = true; return; }
      tipTimer = setTimeout(() => showTip(el), tipEl.hidden ? 450 : 0);
    });
    root.addEventListener('pointerout', (e) => { if (!e.relatedTarget || !root.contains(e.relatedTarget)) hideTip(); });
    root.addEventListener('focusin', (e) => { const el = e.target.closest('[data-tip]'); if (el && el.matches(':focus-visible')) showTip(el); });
    root.addEventListener('focusout', hideTip);

    /* ---------- keyboard ---------- */
    const keyTarget = opt.keys === 'focus' ? root : window;
    function onKey(e) {
      if (!base || textEdit) return;
      if (opt.keys === 'focus' && !root.contains(document.activeElement)) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') && t !== textarea) return;
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (mod) {
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
        else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
        else if (k === 'c') { if (!String(window.getSelection && window.getSelection()).length) { e.preventDefault(); copy(); } }
        else if (k === 's') { e.preventDefault(); save(e.shiftKey); }
        else if (k === '0') { e.preventDefault(); fit(); }
        else if (k === '1') { e.preventDefault(); fit('actual'); }
        else if (k === '=' || k === '+') { e.preventDefault(); zoomAt(view.s * 1.25, view.w / 2, view.h / 2); }
        else if (k === '-') { e.preventDefault(); zoomAt(view.s / 1.25, view.w / 2, view.h / 2); }
        return;
      }
      if (e.altKey) return;
      if (k === 'escape') {
        if (pop && !pop.hidden) { togglePop(false); return; }
        if (drag) return;
        if (selected) { selected = null; syncUi(); render(); return; }
        if (overlay || opt.onClose) { e.preventDefault(); close(); }
        return;
      }
      if (k === 'enter' && overlay && crop) { e.preventDefault(); copy().then(() => opt.onClose && opt.onClose('copied')); return; }
      if ((k === 'delete' || k === 'backspace') && selected) { e.preventDefault(); deleteSelected(); return; }
      if (k === ' ' && !overlay) { if (!spaceDown) { spaceDown = true; updateCursor(); } e.preventDefault(); return; }
      if (e.key.startsWith('Arrow') && selected) {
        e.preventDefault();
        const step = (e.shiftKey ? 10 : 1) * pr;
        const before = snapshot();
        moveShape(selected, k === 'arrowleft' ? -step : k === 'arrowright' ? step : 0, k === 'arrowup' ? -step : k === 'arrowdown' ? step : 0);
        commit(before);
        render();
        return;
      }
      const tl = TOOLS.find((x) => x.key === k && !(overlay && x.full));
      if (tl) { e.preventDefault(); setTool(tl.id); }
    }
    function onKeyUp(e) { if (e.key === ' ') { spaceDown = false; updateCursor(); } }
    keyTarget.addEventListener('keydown', onKey);
    keyTarget.addEventListener('keyup', onKeyUp);

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', () => { if (!drag) { hover = null; if (overlay) render(); } });
    stage.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    const ro = new ResizeObserver(resize);
    ro.observe(stage);
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => render();
    mq.addEventListener('change', onScheme);

    /* ---------- image ---------- */
    async function setImage(image, o) {
      o = o || {};
      const bmp = await toBitmap(image);
      base = await makeTiles(bmp);
      if (o.pixelRatio) pr = o.pixelRatio;
      if (o.name) opt.name = o.name;
      if (notice) {
        notice.hidden = !o.notice;
        notice.textContent = o.notice || '';
      }
      reset();
      autoFit = true;
      fitMode = undefined;
      resize();
      canvas.setAttribute('aria-label', 'Screenshot, ' + base.w + ' by ' + base.h + ' pixels');
    }
    function reset() {
      if (textEdit) { textEdit = null; textarea.hidden = true; }
      shapes = []; crop = null; past = []; future = []; selected = null; drag = null;
      if (overlay) { tool = 'select'; if (pop) pop.hidden = true; }
      syncUi();
      render();
    }

    syncUi();
    if (opt.image) await setImage(opt.image, { pixelRatio: opt.pixelRatio, notice: opt.notice });
    else resize();

    return {
      setImage,
      toBlob,
      reset,
      copy,
      save,
      get size() { return base ? { w: base.w, h: base.h } : null; },
      get shapes() { return shapes.map(cloneShape); },
      get crop() { return crop && Object.assign({}, crop); },
      setTool, setColor, setSize,
      setName(name) { opt.name = name || 'swoop'; },
      destroy() {
        ro.disconnect();
        mq.removeEventListener('change', onScheme);
        document.removeEventListener('pointerdown', onOutside, true);
        window.removeEventListener('blur', onBlur);
        keyTarget.removeEventListener('keydown', onKey);
        keyTarget.removeEventListener('keyup', onKeyUp);
        cancelAnimationFrame(frame);
        root.innerHTML = '';
        root.classList.remove('se', 'se-overlay', 'se-full');
      },
    };
  }

  global.SwoopEditor = { create, COLORS, TOOLS };
})(typeof window !== 'undefined' ? window : globalThis);
