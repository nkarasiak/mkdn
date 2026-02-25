import { DB_VECTORS } from '../constants.js';
const DB_VERSION = 1;
const STORE_NAME = 'embeddings';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_VECTORS, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('byPath', 'path', { unique: false });
        store.createIndex('byUpdated', 'updatedAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(mode, fn) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      const result = fn(store);
      transaction.oncomplete = () => resolve(result._result ?? result);
      transaction.onerror = () => reject(transaction.error);
    });
  });
}

export const vectorDB = {
  /**
   * Store an embedding for a document.
   * @param {string} id - Unique document identifier (path or fileId)
   * @param {string} path - File path
   * @param {string} name - File name
   * @param {string} content - Text content (for preview)
   * @param {Float32Array} embedding - The embedding vector
   */
  async store(id, path, name, content, embedding) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      store.put({
        id,
        path,
        name,
        preview: content.slice(0, 300),
        embedding: Array.from(embedding), // Store as regular array for IndexedDB
        updatedAt: Date.now(),
      });

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  /**
   * Get a single embedding by ID.
   */
  async get(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(id);
      request.onsuccess = () => {
        const result = request.result;
        if (result?.embedding) {
          result.embedding = new Float32Array(result.embedding);
        }
        resolve(result || null);
      };
      request.onerror = () => reject(request.error);
    });
  },

  /**
   * Get all stored embeddings.
   */
  async getAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        const results = request.result.map(r => ({
          ...r,
          embedding: new Float32Array(r.embedding),
        }));
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  },

  /**
   * Delete an embedding by ID.
   */
  async delete(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  /**
   * Clear all embeddings.
   */
  async clear() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  /**
   * Get the count of stored embeddings.
   */
  async count() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
};
