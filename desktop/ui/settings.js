/* Swoop desktop: the settings and help window. */
(async function () {
  'use strict';
  const { invoke } = window.__TAURI__.core;
  const $ = (id) => document.getElementById(id);

  const s = await invoke('get_settings');
  const windows = s.platform === 'windows';
  const wayland = s.wayland;

  $('version').textContent = 'Version ' + s.version + '.';
  $('folder').textContent = s.save_dir;
  $('autostart').checked = s.autostart;
  if (!windows) $('auto-label').textContent = 'Start when I log in';
  function showKeyNotes(v) {
    const on = v.print_screen;
    const taken = on && windows && v.print_screen_taken;
    $('printscreen').checked = on;
    $('how').hidden = !on;
    $('how-off').hidden = on;
    $('taken').hidden = !taken;
    $('nokey').hidden = !on || v.hotkey_ok || taken || wayland;
  }
  showKeyNotes(s);
  $('printscreen').addEventListener('change', async (e) => {
    try { showKeyNotes(await invoke('set_print_screen', { on: e.target.checked })); }
    catch (err) { e.target.checked = !e.target.checked; }
  });
  $('wayland').hidden = !wayland;

  $('autostart').addEventListener('change', async (e) => {
    try { e.target.checked = await invoke('set_autostart', { on: e.target.checked }); }
    catch (err) { e.target.checked = !e.target.checked; }
  });
  $('change').addEventListener('click', async () => {
    const dir = await invoke('choose_folder');
    if (dir) $('folder').textContent = dir;
  });
  $('open').addEventListener('click', () => invoke('open_folder'));
  $('keyboard').addEventListener('click', () => invoke('open_keyboard_settings'));
  $('capture').addEventListener('click', () => invoke('capture_now'));
  $('site').addEventListener('click', () => invoke('open_link', { url: 'https://mhfrough.github.io/swoop/' }));

  // the Snipping Tool switch may change while this window is open; asking again retries the key
  window.addEventListener('focus', async () => {
    const now = await invoke('get_settings');
    showKeyNotes(now);
    $('autostart').checked = now.autostart;
  });
})();
