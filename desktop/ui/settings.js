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
    const taken = windows && v.print_screen_taken;
    $('taken').hidden = !taken;
    $('nokey').hidden = v.hotkey_ok || taken || wayland;
  }
  showKeyNotes(s);
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
