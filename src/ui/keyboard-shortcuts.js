import { documentStore } from '../store/document-store.js';
import { fileSaver } from '../save/file-saver.js';
import { settingsStore } from '../store/settings-store.js';
import { closeModal } from '../ui/modal.js';
import { closeAllDropdowns } from '../toolbar/toolbar.js';
import { openLinkPopover } from '../ui/link-popover.js';
import { openCommandPalette, closeCommandPalette, isCommandPaletteOpen } from '../command-palette/command-palette.js';
import { openFindBar, closeFindBar, isFindBarOpen } from '../find-replace/find-bar.js';
import { sourceFormat } from '../editor/source-formatter.js';
import { editorZoom } from '../editor/editor-zoom.js';
import { tabStore } from '../store/tab-store.js';

let focusManagerRef = null;

export function initKeyboardShortcuts({ toggleSidebar, toggleHistory, focusManager }) {
  focusManagerRef = focusManager;

  document.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    const key = e.key.toLowerCase();

    // Escape: topmost thing first — modal → menus → find bar → palette → focus modes → sidebar.
    if (key === 'escape') {
      if (closeModal()) return;
      if (closeAllDropdowns()) return;
      if (closeFindBar()) return;
      if (closeCommandPalette()) return;
      // A component (slash menu, tab rename…) already used this Escape. ProseMirror's own
      // keymap also claims it, so only skip when the event didn't come from the editor.
      if (e.defaultPrevented && !e.target.closest?.('.ProseMirror')) return;
      if (focusManagerRef?.exitAllModes()) return;
      if (settingsStore.get('sidebarOpen')) settingsStore.set('sidebarOpen', false);
      return;
    }

    // Ctrl+Tab / Ctrl+Shift+Tab — Next/Previous tab
    if (ctrl && key === 'tab') {
      e.preventDefault();
      if (shift) tabStore.prevTab(); else tabStore.nextTab();
      return;
    }

    if (!ctrl) return;

    // Ctrl+Q — Quit (Tauri only)
    if (key === 'q' && !shift) {
      e.preventDefault();
      import('../platform/tauri-bridge.js').then(({ isTauri }) => {
        if (isTauri()) {
          import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
            getCurrentWindow().close();
          });
        }
      });
      return;
    }

    // Source mode formatting shortcuts (Ctrl+B/I/E)
    // ProseMirror doesn't see keys when textarea has focus, so we handle them here.
    if (settingsStore.get('sourceMode')) {
      if (key === 'b' && !shift) {
        e.preventDefault();
        sourceFormat.bold();
        return;
      }
      if (key === 'i' && !shift) {
        e.preventDefault();
        sourceFormat.italic();
        return;
      }
      if (key === 'e' && !shift) {
        e.preventDefault();
        sourceFormat.inlineCode();
        return;
      }
    }

    // Ctrl+S — Save
    if (key === 's' && !shift) {
      e.preventDefault();
      fileSaver.save();
      return;
    }

    // Ctrl+Shift+S — Save As
    if (key === 's' && shift) {
      e.preventDefault();
      fileSaver.saveAs();
      return;
    }

    // Ctrl+N — New document (opens in a new tab; nothing is discarded)
    if (key === 'n' && !shift) {
      e.preventDefault();
      documentStore.newDocument();
      return;
    }

    // Ctrl+T — New tab
    if (key === 't' && !shift) {
      e.preventDefault();
      documentStore.newDocument();
      return;
    }

    // Ctrl+Shift+T — Reopen last closed tab
    if (key === 't' && shift) {
      e.preventDefault();
      tabStore.reopenTab();
      return;
    }

    // Ctrl+W / Ctrl+Shift+W — Close current tab (no-op on last tab)
    if (key === 'w') {
      e.preventDefault();
      tabStore.closeTab(tabStore.getActiveTabId());
      return;
    }

    // Ctrl+Shift+B — Toggle sidebar
    if (key === 'b' && shift) {
      e.preventDefault();
      toggleSidebar();
      return;
    }

    // Ctrl+Shift+H — Toggle history drawer
    if (key === 'h' && shift) {
      e.preventDefault();
      toggleHistory();
      return;
    }

    // Ctrl+O — Open file from disk
    if (key === 'o' && !shift) {
      e.preventDefault();
      fileSaver.openFile();
      return;
    }

    // Ctrl+L — Create link via popover
    if (key === 'l' && !shift) {
      e.preventDefault();
      openLinkPopover();
      return;
    }

    // Ctrl+F — Find
    if (key === 'f' && !shift) {
      e.preventDefault();
      openFindBar(false);
      return;
    }

    // Ctrl+H — Find & Replace
    if (key === 'h' && !shift) {
      e.preventDefault();
      openFindBar(true);
      return;
    }

    // Ctrl+Shift+F — Cycle focus/zen modes
    if (key === 'f' && shift) {
      e.preventDefault();
      focusManagerRef?.cycleMode();
      return;
    }

    // Ctrl+K — Open command palette
    if (key === 'k' && !shift) {
      e.preventDefault();
      openCommandPalette();
      return;
    }

    // Ctrl+P — Print / Export PDF
    if (key === 'p' && !shift) {
      e.preventDefault();
      import('../utils/export.js').then(m => m.printDocument());
      return;
    }

    // Ctrl+U — Toggle source view
    if (key === 'u' && !shift) {
      e.preventDefault();
      settingsStore.set('sourceMode', !settingsStore.get('sourceMode'));
      return;
    }

    // Ctrl+= / Ctrl++ — Zoom in
    if ((key === '=' || key === '+') && !shift) {
      e.preventDefault();
      editorZoom.zoomIn();
      return;
    }
    if (key === '+' && shift) {
      e.preventDefault();
      editorZoom.zoomIn();
      return;
    }

    // Ctrl+- — Zoom out
    if (key === '-' && !shift) {
      e.preventDefault();
      editorZoom.zoomOut();
      return;
    }

    // Ctrl+0 — Reset zoom
    if (key === '0' && !shift) {
      e.preventDefault();
      editorZoom.reset();
      return;
    }

  });
}
