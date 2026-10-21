/* Swoop: settings, kept in chrome.storage.sync. The defaults match background.js. */
(async function () {
  'use strict';
  const DEFAULTS = { preScroll: true, hideFixed: true, settle: 250 };
  const form = document.getElementById('form');
  const saved = document.getElementById('saved');
  const values = await chrome.storage.sync.get(DEFAULTS);
  form.preScroll.checked = !!values.preScroll;
  form.hideFixed.checked = !!values.hideFixed;
  form.settle.value = String(values.settle);

  let timer = 0;
  form.addEventListener('change', async () => {
    await chrome.storage.sync.set({
      preScroll: form.preScroll.checked,
      hideFixed: form.hideFixed.checked,
      settle: Number(form.settle.value),
    });
    saved.textContent = 'Saved';
    clearTimeout(timer);
    timer = setTimeout(() => { saved.textContent = ''; }, 1500);
  });
  document.getElementById('shortcuts').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));
})();
