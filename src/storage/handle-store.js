const DB_NAME = 'mkdn-handles';
const DB_VERSION = 1;
const STORE_NAME = 'handles';
const HANDLE_KEY = 'localFolder';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const handleStore = {
  async saveHandle(handle) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE_NAME, 'readwrite');
      t.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },

  async loadHandle() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE_NAME, 'readonly');
      const req = t.objectStore(STORE_NAME).get(HANDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  async clearHandle() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE_NAME, 'readwrite');
      t.objectStore(STORE_NAME).delete(HANDLE_KEY);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },
};
