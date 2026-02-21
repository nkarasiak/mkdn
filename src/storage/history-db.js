const DB_NAME = 'downtomark-history';
const DB_VERSION = 1;
const STORE_NAME = 'snapshots';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('byFileKey', 'fileKey', { unique: false });
        store.createIndex('byFileKeyTime', ['fileKey', 'timestamp'], { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const historyDB = {
  async addSnapshot({ fileKey, fileName, content, trigger, message }) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE_NAME, 'readwrite');
      const store = t.objectStore(STORE_NAME);
      const record = { fileKey, fileName, content, trigger, timestamp: Date.now() };
      if (message) record.message = message;
      const req = store.add(record);
      req.onsuccess = () => resolve(req.result);
      t.onerror = () => reject(t.error);
    });
  },

  async getSnapshots(fileKey, limit = 50) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE_NAME, 'readonly');
      const index = t.objectStore(STORE_NAME).index('byFileKeyTime');
      const range = IDBKeyRange.bound([fileKey, 0], [fileKey, Infinity]);
      const req = index.openCursor(range, 'prev');
      const results = [];
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      req.onerror = () => reject(req.error);
    });
  },

  async getSnapshot(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE_NAME, 'readonly');
      const req = t.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async deleteSnapshot(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE_NAME, 'readwrite');
      t.objectStore(STORE_NAME).delete(id);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },

  async pruneSnapshots(fileKey, max = 50) {
    const all = await this.getSnapshots(fileKey, Infinity);
    if (all.length <= max) return;
    const db = await openDB();
    const toDelete = all.slice(max);
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE_NAME, 'readwrite');
      const store = t.objectStore(STORE_NAME);
      for (const snap of toDelete) {
        store.delete(snap.id);
      }
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },
};
