const DB_NAME = 'mkdn-library';
const DB_VERSION = 1;
const STORE_NAME = 'documents';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('byModified', 'modified', { unique: false });
        store.createIndex('byFolder', 'folder', { unique: false });
        store.createIndex('byTitle', 'title', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function generateId() {
  return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function extractTitle(content) {
  const match = content.match(/^#\s+(.+)/m);
  return match ? match[1].trim() : '';
}

function wordCount(content) {
  if (!content) return 0;
  const text = content.replace(/[#*_`~\[\]()>|\\-]/g, ' ').trim();
  return text ? text.split(/\s+/).length : 0;
}

export const libraryDB = {
  /**
   * Save a document (create or update).
   * @param {object} doc - { id?, title, content, folder? }
   * @returns {string} document id
   */
  async save(doc) {
    const db = await openDB();
    const now = Date.now();
    const id = doc.id || generateId();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      // Check if exists for created date
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const existing = getReq.result;
        const record = {
          id,
          title: doc.title || extractTitle(doc.content) || 'Untitled',
          content: doc.content || '',
          folder: doc.folder || '',
          tags: doc.tags || existing?.tags || [],
          created: existing?.created || now,
          modified: now,
          wordCount: wordCount(doc.content),
        };
        store.put(record);
      };

      tx.oncomplete = () => resolve(id);
      tx.onerror = () => reject(tx.error);
    });
  },

  /** Get a single document by id. */
  async get(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  /** Get all documents, sorted by modified desc. */
  async getAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const index = tx.objectStore(STORE_NAME).index('byModified');
      const req = index.openCursor(null, 'prev');
      const results = [];
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      req.onerror = () => reject(req.error);
    });
  },

  /** Delete a document by id. */
  async delete(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  /** Get all unique folders. */
  async getFolders() {
    const docs = await this.getAll();
    const folders = new Set(docs.map(d => d.folder).filter(Boolean));
    return [...folders].sort();
  },

  /** Search documents by title/content query. */
  async search(query) {
    const q = query.toLowerCase();
    const all = await this.getAll();
    return all.filter(d =>
      d.title.toLowerCase().includes(q) ||
      d.content.toLowerCase().includes(q) ||
      d.tags.some(t => t.toLowerCase().includes(q))
    );
  },

  /** Export all documents as a JSON blob. */
  async exportAll() {
    const docs = await this.getAll();
    return JSON.stringify(docs, null, 2);
  },

  /** Import documents from JSON blob. */
  async importAll(json) {
    const docs = JSON.parse(json);
    for (const doc of docs) {
      await this.save(doc);
    }
    return docs.length;
  },
};
