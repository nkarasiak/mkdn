import { el } from './utils/dom.js';
import { settingsStore } from './store/settings-store.js';
import { eventBus } from './store/event-bus.js';
import { milkdown } from './editor/milkdown-setup.js';
import { createToolbar } from './toolbar/toolbar.js';
import { createSidebar, toggleHistorySection } from './sidebar/sidebar.js';
import { createStatusBar } from './ui/status-bar.js';
import { initKeyboardShortcuts } from './ui/keyboard-shortcuts.js';
import { localSync } from './local/local-sync.js';
import { fileSaver } from './save/file-saver.js';
import { sessionStore } from './storage/session-store.js';
import { historyManager } from './history/history-manager.js';

let sidebarWrapper, sidebarOverlay;

function applyTheme() {
  document.documentElement.setAttribute('data-theme', 'light');
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
    });

    // Main content area
    const main = el('div', { className: 'app-main' }, editorPane);

    // App shell
    const app = el('div', { className: 'app' },
      el('div', { className: 'app-toolbar' }, toolbar),
      sidebarWrapper,
      main,
      sidebarOverlay,
      el('div', { className: 'app-statusbar' }, statusbar),
    );

    appEl.appendChild(app);

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

    // Init keyboard shortcuts
    initKeyboardShortcuts({ toggleSidebar, toggleHistory: () => toggleHistorySection() });
  },
};
