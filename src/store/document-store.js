import { eventBus } from './event-bus.js';

const DEFAULT_CONTENT = `# Welcome to mkdn

A minimal markdown editor. Type markdown and it renders as you write.

**Ctrl+O** to open a file, **Ctrl+S** to save, **Ctrl+U** to see the raw markdown. Everything else is in the ☰ menu.
`;

let state = {
  markdown: DEFAULT_CONTENT,
  fileName: 'Untitled.md',
  fileId: null,
  fileSource: null,
  dirty: false,
  lastSaved: null,
  lastModifiedOnDisk: null,
};

// The editor syncs to the store lazily; it registers a flush so every read sees the latest edit.
let flushEditor = () => {};

export const documentStore = {
  setFlusher(fn) {
    flushEditor = fn;
  },

  /** Push pending editor edits into the store (call before switching documents). */
  flush() {
    flushEditor();
  },

  getMarkdown() {
    flushEditor();
    return state.markdown;
  },

  setMarkdown(content, source = 'unknown') {
    if (content === state.markdown) return;
    state.markdown = content;
    state.dirty = true;
    eventBus.emit('content:changed', { content, source });
  },

  getFileName() {
    return state.fileName;
  },

  setFileName(name) {
    state.fileName = name;
    eventBus.emit('file:renamed', { name });
  },

  getFileId() {
    return state.fileId;
  },

  getFileSource() {
    return state.fileSource;
  },

  setFile(id, name, content, source = null, lastModifiedOnDisk = null) {
    flushEditor();
    state.fileId = id;
    state.fileName = name;
    state.markdown = content;
    state.fileSource = source;
    state.dirty = false;
    state.lastSaved = Date.now();
    state.lastModifiedOnDisk = lastModifiedOnDisk;
    eventBus.emit('file:opened', { id, name, source });
    eventBus.emit('content:changed', { content, source: 'file-open' });
  },

  getLastModifiedOnDisk() {
    return state.lastModifiedOnDisk;
  },

  setLastModifiedOnDisk(ts) {
    state.lastModifiedOnDisk = ts;
  },

  markSaved() {
    state.dirty = false;
    state.lastSaved = Date.now();
    eventBus.emit('file:saved', { fileName: state.fileName, lastSaved: state.lastSaved });
  },

  isDirty() {
    return state.dirty;
  },

  getLastSaved() {
    return state.lastSaved;
  },

  newDocument() {
    flushEditor();
    state.fileId = null;
    state.fileSource = null;
    state.fileName = 'Untitled.md';
    state.markdown = '';
    state.dirty = false;
    state.lastSaved = null;
    state.lastModifiedOnDisk = null;
    eventBus.emit('file:new', {});
    eventBus.emit('content:changed', { content: '', source: 'new-document' });
  },

  restoreState(saved) {
    if (!saved) return;
    state.markdown = saved.markdown ?? state.markdown;
    state.fileName = saved.fileName ?? state.fileName;
    state.fileId = saved.fileId ?? null;
    state.fileSource = saved.fileSource ?? null;
    state.dirty = saved.dirty ?? false;
    state.lastSaved = saved.lastSaved ?? null;
    state.lastModifiedOnDisk = saved.lastModifiedOnDisk ?? null;
    // Emit file:opened so breadcrumb/UI updates with the restored filename
    if (state.fileId) {
      eventBus.emit('file:opened', { id: state.fileId, name: state.fileName, source: state.fileSource });
    }
    eventBus.emit('content:changed', { content: state.markdown, source: 'session-restore' });
  },

  getState() {
    flushEditor();
    return { ...state };
  },
};
