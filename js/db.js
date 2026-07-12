/* IndexedDB wrapper for OCR sessions.
 * Each session: { id, createdAt, lang, text, imageBlob, thumbBlob }
 * We keep a rolling cap of MAX_SESSIONS; oldest are pruned on save.
 */
const DB_NAME = "webocr";
const DB_VERSION = 1;
const STORE = "sessions";
const MAX_SESSIONS = 50;

const db = (function () {
  let _db = null;

  function open() {
    return new Promise((resolve, reject) => {
      if (_db) return resolve(_db);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const conn = req.result;
        if (!conn.objectStoreNames.contains(STORE)) {
          conn.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => {
        _db = req.result;
        resolve(_db);
      };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(mode) {
    return open().then((c) => c.transaction(STORE, mode).objectStore(STORE));
  }

  function reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  return {
    async add(session) {
      const store = await tx("readwrite");
      await reqToPromise(store.put(session));
      await this.prune();
    },

    async update(session) {
      const store = await tx("readwrite");
      await reqToPromise(store.put(session));
    },

    async get(id) {
      const store = await tx("readonly");
      return reqToPromise(store.get(id));
    },

    async all() {
      const store = await tx("readonly");
      const items = await reqToPromise(store.getAll());
      return items.sort((a, b) => b.createdAt - a.createdAt);
    },

    async remove(id) {
      const store = await tx("readwrite");
      await reqToPromise(store.delete(id));
    },

    async clear() {
      const store = await tx("readwrite");
      await reqToPromise(store.clear());
    },

    async prune() {
      const store = await tx("readwrite");
      const items = await reqToPromise(store.getAll());
      if (items.length <= MAX_SESSIONS) return;
      const sorted = items.sort((a, b) => a.createdAt - b.createdAt);
      const toRemove = sorted.slice(0, items.length - MAX_SESSIONS);
      await Promise.all(toRemove.map((s) => reqToPromise(store.delete(s.id))));
    },
  };
})();

if (typeof window !== "undefined") {
  window.OCR_DB = db;
}