import { el } from './utils/dom.js';
import { settingsStore } from './store/settings-store.js';
import { eventBus } from './store/event-bus.js';
import { milkdown } from './editor/milkdown-setup.js';
import { createToolbar } from './toolbar/toolbar.js';
import { createStatusBar } from './ui/status-bar.js';
import { initKeyboardShortcuts } from './ui/keyboard-shortcuts.js';
import { fileSaver } from './save/file-saver.js';
import { sessionStore } from './storage/session-store.js';
import { historyManager } from './history/history-manager.js';
import { documentStore } from './store/document-store.js';
import { toast } from './ui/toast.js';
import { editorZoom } from './editor/editor-zoom.js';
import { initFindBar } from './find-replace/find-bar.js';
import { isTauri, initTauri, initTauriEvents, restoreTauriFile } from './platform/tauri-bridge.js';
import { createTabBar, initTabs } from './toolbar/tab-bar.js';
import { initPWA } from './pwa/pwa-manager.js';

function applyTheme() {
  const theme = settingsStore.getResolvedTheme();
  document.documentElement.setAttribute('data-theme', theme);
}

// Listen for OS dark/light mode changes when theme is 'auto'
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (settingsStore.getTheme() === 'auto') applyTheme();
});

function updateDocTitle() {
  const fileName = documentStore.getFileName();
  const displayName = fileName && fileName !== 'Untitled.md'
    ? fileName.replace(/\.md$/i, '')
    : null;
  const title = displayName ? `MKDN — ${displayName}` : 'MKDN';
  document.title = title;

  // Also set the native Tauri window title
  if (isTauri()) {
    import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
      getCurrentWindow().setTitle(title);
    }).catch(() => {});
  }
}

export const App = {
  async init() {
    const appEl = document.getElementById('app');

    // Apply theme
    applyTheme();

    // Create editor pane
    const editorPane = el('div', { className: 'editor-pane' });

    // Create source editor (raw markdown textarea)
    const sourceEditor = el('textarea', { className: 'source-editor', spellcheck: false });
    const sourceWrapper = el('div', { className: 'source-editor-wrapper' }, sourceEditor);

    const toolbar = createToolbar();

    // Create tab bar
    const tabBar = createTabBar();

    const statusbar = createStatusBar(sourceEditor);

    // Main content area
    const main = el('div', { className: 'app-main' }, editorPane, sourceWrapper);

    // Ctrl/Cmd + wheel zoom (browser-like)
    editorZoom.init(main);

    // Drag & drop file open
    let dragCounter = 0;
    main.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      app.classList.add('drag-over');
    });
    main.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    main.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        app.classList.remove('drag-over');
      }
    });
    main.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      app.classList.remove('drag-over');
      const file = [...e.dataTransfer.files].find(f =>
        /\.(md|markdown|txt)$/i.test(f.name)
      );
      if (!file) {
        toast('Only .md, .markdown, and .txt files are supported', 'warning');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => documentStore.setFile(file.name, file.name, reader.result, 'local');
      reader.readAsText(file);
    });

    // App shell
    const app = el('div', { className: 'app' }, toolbar, tabBar, main, statusbar);

    appEl.appendChild(app);

    // Initialize Tauri desktop integration (native file I/O, updater)
    await initTauri();

    // Restore session before Milkdown init so restored content is the initial value
    await sessionStore.restoreSession();
    // In Tauri, re-read absolute-path files from disk (files opened via OS/CLI)
    if (documentStore.getFileSource() === 'local') {
      await restoreTauriFile(documentStore.getFileId());
    }

    // Initialize Milkdown (always-on)
    await milkdown.init(editorPane);

    // Initialize tab system
    initTabs();

    // Autosave + "changed on disk" detection for files opened from disk
    fileSaver.init();

    // Initialize session persistence and history
    sessionStore.init();
    historyManager.init();

    eventBus.on('settings:theme', applyTheme);

    // Initialize Find & Replace
    initFindBar({ editorContainer: main, milkdown });

    // Source mode toggling with cursor sync
    eventBus.on('settings:sourceMode', (on) => {
      if (on) {
        // WYSIWYG → Source: capture cursor position before switching
        const markdown = documentStore.getMarkdown();
        const cursorOffset = milkdown.getCursorAsMarkdownOffset(markdown);

        editorPane.style.display = 'none';
        sourceWrapper.style.display = 'block';
        sourceEditor.style.display = 'block';
        sourceEditor.value = markdown;

        // Restore cursor position in textarea
        const clampedOffset = Math.min(cursorOffset, sourceEditor.value.length);
        sourceEditor.setSelectionRange(clampedOffset, clampedOffset);
        sourceEditor.focus();

        // Scroll to cursor position
        // Use a temporary measurement to scroll the textarea
        requestAnimationFrame(() => {
          sourceEditor.blur();
          sourceEditor.setSelectionRange(clampedOffset, clampedOffset);
          sourceEditor.focus();
        });
      } else {
        // Source → WYSIWYG: capture cursor offset before switching
        const cursorOffset = sourceEditor.selectionStart;
        const value = sourceEditor.value;

        sourceWrapper.style.display = 'none';
        sourceEditor.style.display = 'none';
        editorPane.style.display = '';
        documentStore.setMarkdown(value, 'source-editor');
        // Explicitly sync milkdown (content:changed skips source-editor to prevent loops)
        milkdown.setContent(value);

        // Restore cursor in ProseMirror after Milkdown processes the content
        requestAnimationFrame(() => {
          milkdown.setCursorFromMarkdownOffset(value, cursorOffset);
        });
      }
    });

    sourceEditor.addEventListener('input', () => {
      documentStore.setMarkdown(sourceEditor.value, 'source-editor');
    });

    eventBus.on('content:changed', ({ source } = {}) => {
      if (source !== 'source-editor' && settingsStore.get('sourceMode')) {
        sourceEditor.value = documentStore.getMarkdown();
      }
    });

    // Window title follows the file name
    eventBus.on('file:opened', updateDocTitle);
    eventBus.on('file:new', updateDocTitle);
    eventBus.on('file:renamed', updateDocTitle);
    updateDocTitle();

    initKeyboardShortcuts();

    // Files opened via the PWA file handler / Tauri (OS double-click, CLI)
    initPWA();
    initTauriEvents();
  },
};
