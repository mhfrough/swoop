/* Swoop: the editor tab. Reads one capture from IndexedDB (the id is in the address after #) and opens it in the shared editor. */
(async function () {
  'use strict';
  const $ = (id) => document.getElementById(id);

  function showMessage(title, text) {
    $('editor').hidden = true;
    $('message').hidden = false;
    $('message-title').textContent = title;
    $('message-text').textContent = text;
    $('title').textContent = title;
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

  const title = shot.title || 'Untitled page';
  $('title').textContent = title;
  document.title = 'Swoop: ' + title;
  $('dims').textContent = shot.width + ' × ' + shot.height + ' px';
  if (shot.url && /^https?:/.test(shot.url)) {
    const a = $('source');
    a.href = shot.url;
    try { a.textContent = new URL(shot.url).hostname.replace(/^www\./, ''); } catch (e) { a.textContent = shot.url; }
    a.hidden = false;
  }

  await SwoopEditor.create($('editor'), {
    layout: 'full',
    image: shot.blob,
    pixelRatio: shot.pixelRatio || 1,
    name: shot.name || 'swoop',
    notice: shot.notice || '',
  });
})();
