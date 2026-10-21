// The desktop app's web side (desktop/ui) with a stand-in for Tauri: the overlay gets a frozen screen as
// raw bytes, you drag a selection, and copy and save send the right bytes back. The Rust side is built
// and run separately (cargo tauri build); this checks the page logic in a normal browser.
const { test, expect } = require('@playwright/test');

const W = 800, H = 600, SCALE = 1.5;

function mockTauri({ settings } = {}) {
  window.__calls = [];
  const listeners = {};
  window.__emit = (name) => listeners[name] && listeners[name]({ event: name, payload: null });
  window.__TAURI__ = {
    event: { listen: async (name, cb) => { listeners[name] = cb; return () => {}; } },
    core: {
      invoke: async (cmd, args, opts) => {
        const bytes = args instanceof Uint8Array ? args : null;
        window.__calls.push({ cmd, args: bytes ? null : args || null, headers: opts && opts.headers || null, size: bytes ? bytes.length : 0 });
        switch (cmd) {
          case 'get_capture': {
            const w = window.__shot.w, h = window.__shot.h;
            const buf = new ArrayBuffer(12 + w * h * 4);
            const v = new DataView(buf);
            v.setUint32(0, w, true); v.setUint32(4, h, true); v.setFloat32(8, window.__shot.scale, true);
            const px = new Uint8Array(buf, 12);
            for (let i = 0; i < w * h; i++) { px[i * 4] = 40; px[i * 4 + 1] = 120; px[i * 4 + 2] = 220; px[i * 4 + 3] = 255; }
            return buf;
          }
          case 'save_image': return 'C:\\Users\\me\\Pictures\\Swoop\\shot.png';
          case 'get_settings': return settings;
          case 'set_autostart': return args.on;
          default: return null;
        }
      },
    },
  };
}

test('the overlay shows a capture, copies the selection at full resolution and hides', async ({ page }) => {
  await page.setViewportSize({ width: W, height: H });
  await page.addInitScript(mockTauri);
  await page.addInitScript(({ w, h, s }) => { window.__shot = { w, h, scale: s }; }, { w: W * SCALE, h: H * SCALE, s: SCALE });
  await page.goto('/desktop/ui/overlay.html');
  await page.waitForFunction(() => typeof window.__emit === 'function' && document.querySelector('.se-canvas'));
  const calls = () => page.evaluate(() => window.__calls.map((c) => c.cmd));

  for (let round = 0; round < 2; round++) {
    await page.evaluate(() => { window.__calls = []; window.__emit('capture'); });
    await expect.poll(calls).toContain('overlay_ready');
    await expect(page.locator('#editor')).not.toHaveClass(/is-waiting/);
    await expect(page.locator('.se-hint')).toBeVisible();

    await page.mouse.move(100, 100);
    await page.mouse.down();
    await page.mouse.move(300, 220, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.press('Enter');
    await expect.poll(calls).toContain('hide_overlay');
    const copy = await page.evaluate(() => window.__calls.find((c) => c.cmd === 'copy_image'));
    expect(copy.headers).toEqual({ 'x-width': String(200 * SCALE), 'x-height': String(120 * SCALE) });
    expect(copy.size).toBe(200 * SCALE * 120 * SCALE * 4);
    await expect(page.locator('#editor')).toHaveClass(/is-waiting/);
  }
});

test('the overlay saves with Ctrl+S, and Esc cancels', async ({ page }) => {
  await page.setViewportSize({ width: W, height: H });
  await page.addInitScript(mockTauri);
  await page.addInitScript(() => { window.__shot = { w: 800, h: 600, scale: 1 }; });
  await page.goto('/desktop/ui/overlay.html');
  await page.waitForFunction(() => typeof window.__emit === 'function' && document.querySelector('.se-canvas'));
  const calls = () => page.evaluate(() => window.__calls.map((c) => c.cmd));

  await page.evaluate(() => window.__emit('capture'));
  await expect.poll(calls).toContain('overlay_ready');
  await page.mouse.move(50, 50);
  await page.mouse.down();
  await page.mouse.move(250, 150, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.press('Control+s');
  await expect.poll(calls).toContain('hide_overlay');
  const save = await page.evaluate(() => window.__calls.find((c) => c.cmd === 'save_image'));
  expect(save.headers['x-save-as']).toBe('0');
  expect(save.headers['x-name']).toMatch(/^Swoop \d{4}-\d\d-\d\d at \d\d\.\d\d\.\d\d\.png$/);
  expect(save.size).toBeGreaterThan(100);

  await page.evaluate(() => { window.__calls = []; window.__emit('capture'); });
  await expect.poll(calls).toContain('overlay_ready');
  await page.keyboard.press('Escape');
  await expect.poll(calls).toContain('hide_overlay');
  expect(await calls()).not.toContain('save_image');
});

test('the settings window shows the Snipping Tool warning and the save folder', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(mockTauri, {
    settings: { version: '0.1.0', platform: 'windows', hotkey_ok: false, wayland: false, print_screen_taken: true, autostart: true, save_dir: 'C:\\Users\\me\\Pictures\\Swoop' },
  });
  await page.goto('/desktop/ui/settings.html');
  await expect(page.locator('#folder')).toHaveText('C:\\Users\\me\\Pictures\\Swoop');
  await expect(page.locator('#taken')).toBeVisible();
  await expect(page.locator('#nokey')).toBeHidden();
  await expect(page.locator('#wayland')).toBeHidden();
  await expect(page.locator('#autostart')).toBeChecked();
  await expect(page.locator('#version')).toHaveText('Version 0.1.0.');

  await page.locator('#autostart').click();
  await expect(page.locator('#autostart')).not.toBeChecked();
  await page.locator('#keyboard').click();
  const cmds = await page.evaluate(() => window.__calls.map((c) => c.cmd + (c.args && 'on' in c.args ? ':' + c.args.on : '')));
  expect(cmds).toContain('set_autostart:false');
  expect(cmds).toContain('open_keyboard_settings');
  expect(errors).toEqual([]);
});

test('the settings window explains Wayland on Linux', async ({ page }) => {
  await page.addInitScript(mockTauri, {
    settings: { version: '0.1.0', platform: 'linux', hotkey_ok: true, wayland: true, print_screen_taken: false, autostart: false, save_dir: '/home/me/Pictures/Swoop' },
  });
  await page.goto('/desktop/ui/settings.html');
  await expect(page.locator('#wayland')).toBeVisible();
  await expect(page.locator('#taken')).toBeHidden();
  await expect(page.locator('#auto-label')).toHaveText('Start when I log in');
});
