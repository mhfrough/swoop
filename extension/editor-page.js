/* Swoop: the editor tab. Reads one capture from IndexedDB (the id is in the address after #) and opens it in the shared editor. */
(async function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const input = $('title');

  // the title field is as wide as its text (the bar's max width and the flex layout cap it)
  const measure = document.createElement('canvas').getContext('2d');
  const fit = () => {
    const cs = getComputedStyle(input);
    measure.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    input.style.width = Math.ceil(measure.measureText(input.value).width + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 2) + 'px';
  };
  document.fonts.ready.then(fit);

  function showMessage(title, text) {
    $('editor').hidden = true;
    $('message').hidden = false;
    $('message-title').textContent = title;
    $('message-text').textContent = text;
    input.value = title;
    fit();
    document.title = 'Swoop';
  }

  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash.startsWith('error=')) {
    showMessage('Swoop could not capture that page', hash.slice(6));
    return;
  }
  let shot = null;
  try { shot = hash ? await SwoopStore.get(hash) : null; } catch (e) {}
  if (!shot) {
    showMessage('This capture is gone', 'Swoop keeps your last 12 captures. Click the Swoop button on any page to make a new one.');
    return;
  }

  let title = shot.title || 'Untitled page';
  input.value = title;
  fit();
  document.title = 'Swoop: ' + title;
  $('dims').textContent = shot.width + ' × ' + shot.height + ' px';
  if (shot.url && /^https?:/.test(shot.url)) {
    const a = $('source');
    a.href = shot.url;
    try { a.textContent = new URL(shot.url).hostname.replace(/^www\./, ''); } catch (e) { a.textContent = shot.url; }
    a.hidden = false;
  }

  const editor = await SwoopEditor.create($('editor'), {
    layout: 'full',
    image: shot.blob,
    pixelRatio: shot.pixelRatio || 1,
    name: shot.name || 'swoop',
    notice: shot.notice || '',
    tool: 'select',
  });

  // Click the title to rename the capture. The new name is also the file name.
  const hint = (name) => { input.title = 'Click to rename. Saves as ' + name; };
  hint(shot.name || 'swoop');
  input.readOnly = false;
  const fileName = (t) => t.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 120);
  function commit() {
    const next = input.value.replace(/\s+/g, ' ').trim();
    const name = fileName(next);
    if (!next || !name) { input.value = title; fit(); return; }
    input.value = next;
    fit();
    if (next === title) return;
    title = next;
    document.title = 'Swoop: ' + title;
    editor.setName(name);
    hint(name);
    SwoopStore.update(hash, { title, name }).catch(() => {});
  }
  input.addEventListener('input', fit);
  input.addEventListener('focus', () => input.select());
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); input.value = title; fit(); input.blur(); }
  });
  input.addEventListener('blur', commit);
})();
