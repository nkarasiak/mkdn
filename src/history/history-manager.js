import { historyDB } from '../storage/history-db.js';
import { documentStore } from '../store/document-store.js';
import { eventBus } from '../store/event-bus.js';
import { collabManager } from '../collab/collab-manager.js';
import { pushSnapshot, fetchSnapshots } from '../collab/collab-history.js';

const PERIODIC_INTERVAL = 5 * 60 * 1000; // 5 minutes
const SERVER_TRIGGERS = new Set(['save', 'autosave', 'checkpoint']);
let periodicTimer = null;
let lastPeriodicContent = null;
let previousState = null;

function getFileKey() {
  const source = documentStore.getFileSource();
  const id = documentStore.getFileId();
  if (source === 'local' && id) return `local::${id}`;
  return '_unsaved';
}

async function saveSnapshot(trigger) {
  const state = documentStore.getState();
  const content = state.markdown;
  if (!content && !content === '') return;

  const fileKey = getFileKey();
  try {
    await historyDB.addSnapshot({
      fileKey,
      fileName: state.fileName,
      content,
      trigger,
    });
    await historyDB.pruneSnapshots(fileKey, 50);
  } catch { /* IndexedDB may be unavailable */ }

  // Push to collab server for qualifying triggers
  if (collabManager.isActive() && SERVER_TRIGGERS.has(trigger)) {
    pushSnapshot({ content, trigger });
  }
}

async function savePreviousState(trigger) {
  if (!previousState || !previousState.markdown) return;
  const fileKey = previousState.fileSource && previousState.fileId
    ? `${previousState.fileSource}::${previousState.fileId}`
    : '_unsaved';
  try {
    await historyDB.addSnapshot({
      fileKey,
      fileName: previousState.fileName,
      content: previousState.markdown,
      trigger,
    });
    await historyDB.pruneSnapshots(fileKey, 50);
  } catch { /* ignore */ }
}

function startPeriodicTimer() {
  stopPeriodicTimer();
  lastPeriodicContent = documentStore.getMarkdown();
  periodicTimer = setInterval(async () => {
    const current = documentStore.getMarkdown();
    if (documentStore.isDirty() && current !== lastPeriodicContent) {
      lastPeriodicContent = current;
      await saveSnapshot('periodic');
      eventBus.emit('history:updated');
    }
  }, PERIODIC_INTERVAL);
}

function stopPeriodicTimer() {
  if (periodicTimer) {
    clearInterval(periodicTimer);
    periodicTimer = null;
  }
}

export const historyManager = {
  init() {
    previousState = documentStore.getState();

    eventBus.on('file:saved', async ({ fileName }) => {
      const trigger = fileName ? 'save' : 'autosave';
      await saveSnapshot(trigger);
      eventBus.emit('history:updated');
    });

    eventBus.on('file:opened', async () => {
      await savePreviousState('before-switch');
      previousState = documentStore.getState();
      lastPeriodicContent = documentStore.getMarkdown();
      eventBus.emit('history:updated');
    });

    eventBus.on('file:new', async () => {
      await savePreviousState('before-switch');
      previousState = documentStore.getState();
      lastPeriodicContent = null;
      eventBus.emit('history:updated');
    });

    startPeriodicTimer();
  },

  getFileKey,

  saveSnapshot,

  async getHistory(fileKey) {
    try {
      return await historyDB.getSnapshots(fileKey);
    } catch {
      return [];
    }
  },

  async createCheckpoint(message = null) {
    const state = documentStore.getState();
    const content = state.markdown;
    if (!content && content !== '') return;

    const fileKey = getFileKey();
    try {
      await historyDB.addSnapshot({
        fileKey,
        fileName: state.fileName,
        content,
        trigger: 'checkpoint',
        message,
      });
      await historyDB.pruneSnapshots(fileKey, 50);
      eventBus.emit('history:updated');
    } catch { /* IndexedDB may be unavailable */ }

    if (collabManager.isActive()) {
      pushSnapshot({ content, trigger: 'checkpoint', message });
    }
  },

  async getCollabHistory() {
    if (!collabManager.isActive()) return [];
    return fetchSnapshots();
  },

  async restoreSnapshot(id) {
    const snap = await historyDB.getSnapshot(id);
    if (!snap) return;
    documentStore.setMarkdown(snap.content, 'history-restore');
    eventBus.emit('history:restored', { id });
  },
};
