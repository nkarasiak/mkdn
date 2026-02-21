import { eventBus } from './event-bus.js';

const DEFAULT_CONTENT = `# Welcome to mkdn

A beautiful markdown editor.

## Getting Started

Start typing here — your text is rendered as you write. Use the **slash menu** (type \`/\`) to insert headings, lists, code blocks, images, and more.

Select any text to see the **floating toolbar** for quick formatting.

## Features

- **WYSIWYG editing** — what you see is what you get
- **Dark mode** — easy on the eyes
- **Local folder sync** — link a folder and work with your files directly
- **Version history** — automatic snapshots you can browse and restore
- **Focus & zen modes** — distraction-free writing
- **Keyboard shortcuts** — fast and efficient

\`\`\`javascript
console.log('Hello, mkdn!');
\`\`\`

> Markdown is a lightweight markup language that you can use to add formatting elements to plaintext text documents.

- [x] Write markdown
`;

let state = {
  markdown: DEFAULT_CONTENT,
  fileName: 'Untitled.md',
  fileId: null,
  fileSource: null,
  dirty: false,
  lastSaved: null,
};

export const documentStore = {
  getMarkdown() {
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

  setFile(id, name, content, source = null) {
    state.fileId = id;
    state.fileName = name;
    state.markdown = content;
    state.fileSource = source;
    state.dirty = false;
    state.lastSaved = Date.now();
    eventBus.emit('file:opened', { id, name, source });
    eventBus.emit('content:changed', { content, source: 'file-open' });
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
    state.fileId = null;
    state.fileSource = null;
    state.fileName = 'Untitled.md';
    state.markdown = '';
    state.dirty = false;
    state.lastSaved = null;
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
    eventBus.emit('content:changed', { content: state.markdown, source: 'session-restore' });
  },

  getState() {
    return { ...state };
  },
};
