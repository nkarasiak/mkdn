import { storage } from './local-storage.js';
import { documentStore } from '../store/document-store.js';
import { eventBus } from '../store/event-bus.js';
import { debounce } from '../utils/debounce.js';

const SESSION_KEY = 'mkdn-session';

function save() {
  const s = documentStore.getState();
  storage.set(SESSION_KEY, {
    markdown: s.markdown,
    fileName: s.fileName,
    fileId: s.fileId,
    fileSource: s.fileSource,
    dirty: s.dirty,
    savedAt: Date.now(),
  });
}

const debouncedSave = debounce(save, 2000);

export const sessionStore = {
  restoreSession() {
    const saved = storage.get(SESSION_KEY);
    if (saved && saved.markdown != null) {
      documentStore.restoreState(saved);
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
      storage.remove(SESSION_KEY);
    });
  },
};
