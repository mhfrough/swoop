/* Swoop desktop: the capture overlay.
   The window is made once at start-up and stays hidden. On every capture the Rust side sizes it to the
   monitor and sends a "capture" event; this page fetches the frozen screen as raw bytes, hands it to the
   shared editor in overlay layout, then asks to be shown. Copy and save go back to Rust as raw bytes. */
(async function () {
  'use strict';
  const { invoke } = window.__TAURI__.core;
  const { listen } = window.__TAURI__.event;
  const root = document.getElementById('editor');
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

  function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} at ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`;
  }

  // after copy or save the overlay goes away, like Lightshot
  let closing = false;
  async function hide() {
    if (closing) return;
    closing = true;
    root.classList.add('is-waiting');
    editor.reset();
    try { await invoke('hide_overlay'); } finally { closing = false; }
  }

  const editor = await SwoopEditor.create(root, {
    layout: 'overlay',
    name: 'Swoop',
    async onCopy(blob) {
      const bmp = await createImageBitmap(blob);
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const x = c.getContext('2d');
      x.drawImage(bmp, 0, 0);
      const rgba = x.getImageData(0, 0, bmp.width, bmp.height).data;
      await invoke('copy_image', new Uint8Array(rgba.buffer), {
        headers: { 'x-width': String(bmp.width), 'x-height': String(bmp.height) },
      });
      setTimeout(hide, 0);
    },
    async onSave(blob, fileName, { saveAs }) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const where = await invoke('save_image', bytes, {
        headers: { 'x-name': fileName, 'x-save-as': saveAs ? '1' : '0' },
      });
      if (!where) return false;            // "Save as" was cancelled; the overlay is already hidden
      setTimeout(hide, 0);
      return 'Saved';
    },
    onClose: hide,
  });

  await listen('capture', async () => {
    try {
      const buf = await invoke('get_capture');
      const head = new DataView(buf, 0, 12);
      const width = head.getUint32(0, true);
      const height = head.getUint32(4, true);
      const scale = head.getFloat32(8, true);
      const pixels = new ImageData(new Uint8ClampedArray(buf, 12, width * height * 4), width, height);
      const bmp = await createImageBitmap(pixels);
      root.classList.add('is-waiting');
      for (const t of root.querySelectorAll('.se-toast.is-on')) t.classList.remove('is-on');
      await editor.setImage(bmp, { pixelRatio: scale, name: 'Swoop ' + stamp() });
      await invoke('overlay_ready');
      // a hidden web view may not paint, so wait for the first frames after showing
      await frame();
      await frame();
      root.classList.remove('is-waiting');
      window.focus();
    } catch (err) {
      console.error('Swoop:', err);
      await invoke('hide_overlay');
    }
  });
})();
