/* Swoop: captures kept in the extension's own IndexedDB, so a tall page never has to fit in a message.
   Used by background.js (importScripts) and editor-page.js. Only the last few captures are kept. */
(function (global) {
  'use strict';
  const DB = 'swoop', STORE = 'shots', KEEP = 12;

  function open() {
    return new Promise((res, rej) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const s = req.result.createObjectStore(STORE, { keyPath: 'id' });
        s.createIndex('created', 'created');
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }
  function tx(db, mode, fn) {
    return new Promise((res, rej) => {
      const t = db.transaction(STORE, mode);
      const out = fn(t.objectStore(STORE));
      t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  }

  async function put(shot) {
    const db = await open();
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    await tx(db, 'readwrite', (s) => s.put(Object.assign({ id, created: Date.now() }, shot)));
    // drop the oldest
    const keys = await tx(db, 'readonly', (s) => s.index('created').getAllKeys());
    if (keys.length > KEEP) {
      await tx(db, 'readwrite', (s) => { for (const k of keys.slice(0, keys.length - KEEP)) s.delete(k); });
    }
    db.close();
    return id;
  }
  async function get(id) {
    const db = await open();
    const shot = await tx(db, 'readonly', (s) => s.get(id));
    db.close();
    return shot;
  }

  global.SwoopStore = { put, get };
})(typeof self !== 'undefined' ? self : window);
