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
import { toast } from './ui/toast.js';
import { registerBuiltinCommands } from './command-palette/command-registry.js';
import { setMilkdownRef } from './command-palette/command-palette.js';
import { extractHeadings } from './command-palette/heading-utils.js';
import { setSourceTextarea } from './editor/source-formatter.js';
import { initFindBar } from './find-replace/find-bar.js';
import { registerExportCommands } from './export/export-commands.js';
import { registerCollabCommands } from './collab/collab-commands.js';
import { registerPluginCommands } from './plugins/plugin-commands.js';
import { registerSearchCommands } from './search/search-commands.js';
import { initBacklinks } from './backlinks/backlinks-ui.js';
import { initWritingStats } from './stats/writing-stats.js';
import { initThemeEditor } from './themes/theme-editor.js';
import { registerGraphCommands } from './graph/graph-commands.js';

let sidebarWrapper, sidebarOverlay;

function applyTheme() {
  const theme = settingsStore.getTheme();
  document.documentElement.setAttribute('data-theme', theme);
}

function updateDocTitle() {
  const md = documentStore.getMarkdown();
  const headings = extractHeadings(md);
  const h1 = headings.find(h => h.level === 1);
  document.title = h1 ? `${h1.text} — MKDN` : 'MKDN';
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
      reader.onload = () => {
        documentStore.setFile(file.name, file.name, reader.result, 'local');
        toast(`Opened ${file.name}`, 'success');
      };
      reader.readAsText(file);
    });

    // App shell
    const app = el('div', { className: 'app' },
      el('div', { className: 'app-toolbar' }, toolbar),
      sidebarWrapper,
      main,
      sidebarOverlay,
      el('div', { className: 'app-statusbar' }, statusbar),
    );

    appEl.appendChild(app);

    // Swipe gestures for sidebar on touch devices
    initSwipeGestures(app);

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

    // Document title sync — derive from first H1
    eventBus.on('content:changed', updateDocTitle);
    eventBus.on('file:opened', updateDocTitle);
    eventBus.on('file:new', updateDocTitle);
    updateDocTitle();

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

    // Register feature commands
    registerExportCommands();
    registerCollabCommands();
    registerSearchCommands();
    registerPluginCommands();
    registerGraphCommands();

    // Initialize backlinks, writing stats, and custom theme
    initBacklinks();
    initWritingStats();
    initThemeEditor();
  },
};

function initSwipeGestures(appEl) {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  appEl.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    tracking = true;
  }, { passive: true });

  appEl.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    // Only trigger if horizontal swipe is dominant and long enough
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.7) return;
    if (window.innerWidth >= 1024) return; // Desktop doesn't need swipe
    if (dx > 0 && startX < 40) {
      // Swipe right from left edge → open sidebar
      settingsStore.set('sidebarOpen', true);
    } else if (dx < 0 && settingsStore.get('sidebarOpen')) {
      // Swipe left while sidebar open → close sidebar
      settingsStore.set('sidebarOpen', false);
    }
  }, { passive: true });
}
