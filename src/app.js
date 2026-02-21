import { el } from './utils/dom.js';
import { settingsStore } from './store/settings-store.js';
import { eventBus } from './store/event-bus.js';
import { milkdown } from './editor/milkdown-setup.js';
import { createToolbar } from './toolbar/toolbar.js';
import { createSidebar, toggleHistorySection, toggleOutlineSection } from './sidebar/sidebar.js';
import { createStatusBar } from './ui/status-bar.js';
import { initKeyboardShortcuts } from './ui/keyboard-shortcuts.js';
import { localSync } from './local/local-sync.js';
import { fileSaver } from './save/file-saver.js';
import { sessionStore } from './storage/session-store.js';
import { historyManager } from './history/history-manager.js';
import { focusManager } from './focus/focus-manager.js';
import { documentStore } from './store/document-store.js';
import { registerBuiltinCommands } from './command-palette/command-registry.js';
import { setMilkdownRef } from './command-palette/command-palette.js';
import { setSourceTextarea } from './editor/source-formatter.js';
import { initFindBar } from './find-replace/find-bar.js';

let sidebarWrapper, sidebarOverlay;

function applyTheme() {
  const theme = settingsStore.getTheme();
  document.documentElement.setAttribute('data-theme', theme);
}

function updateDocTitle({ name } = {}) {
  const fileName = name || documentStore.getFileName() || 'Untitled.md';
  document.title = `${fileName} — mkdn`;
}

function applySidebarState(open) {
  sidebarWrapper?.classList.toggle('collapsed', !open);
  sidebarOverlay?.classList.toggle('visible', open && window.innerWidth < 1024);
}

function toggleSidebar() {
  const current = settingsStore.get('sidebarOpen');
  settingsStore.set('sidebarOpen', !current);
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

    // Create sidebar
    const sidebar = createSidebar();
    sidebarWrapper = el('div', { className: 'app-sidebar' }, sidebar);
    sidebarOverlay = el('div', { className: 'sidebar-overlay' });
    sidebarOverlay.addEventListener('click', () => settingsStore.set('sidebarOpen', false));

    // Create toolbar
    const toolbar = createToolbar({
      onToggleSidebar: toggleSidebar,
      onSave: () => fileSaver.save(),
      onOpen: () => fileSaver.openFile(),
      onOpenFolder: async () => {
        await localSync.linkFolder();
        settingsStore.set('sidebarOpen', true);
      },
    });

    // Create status bar
    const statusbar = createStatusBar({
      onToggleHistory: () => toggleHistorySection(),
      focusManager,
    });

    // Main content area
    const main = el('div', { className: 'app-main' }, editorPane, sourceWrapper);

    // App shell
    const app = el('div', { className: 'app' },
      el('div', { className: 'app-toolbar' }, toolbar),
      sidebarWrapper,
      main,
      sidebarOverlay,
      el('div', { className: 'app-statusbar' }, statusbar),
    );

    appEl.appendChild(app);

    // Initialize focus manager
    focusManager.init(app);

    // Restore session before Milkdown init so restored content is the initial value
    sessionStore.restoreSession();

    // Initialize Milkdown (always-on)
    await milkdown.init(editorPane);

    // Initialize local folder support
    localSync.init();

    // Initialize session persistence and history
    sessionStore.init();
    historyManager.init();

    // Apply initial states
    applySidebarState(settingsStore.get('sidebarOpen'));

    // Listen for settings changes
    eventBus.on('settings:sidebarOpen', applySidebarState);
    eventBus.on('settings:theme', applyTheme);

    // Register textarea for source-formatter
    setSourceTextarea(sourceEditor);

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

    // Document title sync
    eventBus.on('file:renamed', updateDocTitle);
    eventBus.on('file:opened', updateDocTitle);
    eventBus.on('file:new', () => updateDocTitle({ name: 'Untitled.md' }));
    updateDocTitle({ name: documentStore.getFileName() });

    // Init keyboard shortcuts
    initKeyboardShortcuts({ toggleSidebar, toggleHistory: () => toggleHistorySection(), focusManager });

    // Register command palette commands and set milkdown reference
    setMilkdownRef(milkdown);
    registerBuiltinCommands({
      toggleSidebar,
      toggleHistory: () => toggleHistorySection(),
      toggleOutline: () => toggleOutlineSection(),
      milkdown,
      fileSaver,
      localSync,
      documentStore,
      focusManager,
    });
  },
};
