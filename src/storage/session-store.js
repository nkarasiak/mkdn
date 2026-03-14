import { storage } from './local-storage.js';
import { documentStore } from '../store/document-store.js';
import { eventBus } from '../store/event-bus.js';
import { debounce } from '../utils/debounce.js';
import { toast } from '../ui/toast.js';
import { STORAGE_SESSION } from '../constants.js';

const IDB_NAME = 'mkdn-session-db';
const IDB_STORE = 'session';
const IDB_KEY = 'current';

// --- IndexedDB helpers (persistent, no size limit) ---

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSave(data) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(data, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbLoad() {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function idbClear() {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- Session save/restore ---

function getSessionData() {
  const s = documentStore.getState();
  return {
    markdown: s.markdown,
    fileName: s.fileName,
    fileId: s.fileId,
    fileSource: s.fileSource,
    dirty: s.dirty,
    savedAt: Date.now(),
  };
}

function save() {
  const data = getSessionData();

  // Save to localStorage (fast, but has quota limits)
  storage.set(STORAGE_SESSION, data);

  // Also save to IndexedDB (no size limit, reliable long-term)
  idbSave(data).catch((err) => {
    console.error('[session] IndexedDB save failed:', err.message);
  });
}

const debouncedSave = debounce(save, 2000);

export const sessionStore = {
  async restoreSession() {
    // Try IndexedDB first (most reliable), fall back to localStorage
    let saved = null;
    try {
      saved = await idbLoad();
    } catch {
      // IndexedDB unavailable — fall back to localStorage
    }

    if (!saved || saved.markdown == null) {
      saved = storage.get(STORAGE_SESSION);
    }

    if (saved && saved.markdown != null) {
      documentStore.restoreState(saved);
      setTimeout(() => toast('Previous session restored', 'info', 2500), 800);
    }
  },

  init() {
    eventBus.on('content:changed', ({ source }) => {
      if (source === 'session-restore') return;
      debouncedSave();
    });

    eventBus.on('file:opened', save);
    eventBus.on('file:saved', save);

    eventBus.on('file:new', () => {
      storage.remove(STORAGE_SESSION);
      idbClear().catch(() => {});
    });
  },
};
