const DB_NAME = 'downtomark';
const DB_VERSION = 1;
const FILES_STORE = 'files';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(FILES_STORE)) {
        db.createObjectStore(FILES_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(mode, fn) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(FILES_STORE, mode);
      const store = transaction.objectStore(FILES_STORE);
      const result = fn(store);
      transaction.oncomplete = () => resolve(result.result ?? result);
      transaction.onerror = () => reject(transaction.error);
    });
  });
}

export const fileCache = {
  async getAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(FILES_STORE, 'readonly');
      const req = t.objectStore(FILES_STORE).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async get(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(FILES_STORE, 'readonly');
      const req = t.objectStore(FILES_STORE).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async put(file) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(FILES_STORE, 'readwrite');
      t.objectStore(FILES_STORE).put(file);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },

  async remove(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(FILES_STORE, 'readwrite');
      t.objectStore(FILES_STORE).delete(id);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },

  async clear() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(FILES_STORE, 'readwrite');
      t.objectStore(FILES_STORE).clear();
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },
};
