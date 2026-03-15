import { documentStore } from '../store/document-store.js';
import { fileSaver } from '../save/file-saver.js';
import { localFs } from '../local/local-fs.js';
import { localSync } from '../local/local-sync.js';
import { settingsStore } from '../store/settings-store.js';
import { closeModal, confirm as confirmModal } from '../ui/modal.js';
import { openLinkPopover } from '../ui/link-popover.js';
import { openCommandPalette, closeCommandPalette, isCommandPaletteOpen } from '../command-palette/command-palette.js';
import { openFileSwitcher, closeFileSwitcher } from '../command-palette/file-switcher.js';
import { openFindBar, closeFindBar, isFindBarOpen } from '../find-replace/find-bar.js';
import { sourceFormat } from '../editor/source-formatter.js';

let focusManagerRef = null;

export function initKeyboardShortcuts({ toggleSidebar, toggleHistory, focusManager }) {
  focusManagerRef = focusManager;

  document.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    const key = e.key.toLowerCase();

    // Escape: close find bar → close file switcher → close palette → exit focus modes → close modal (priority chain)
    if (key === 'escape') {
      if (closeFindBar()) return;
      if (closeFileSwitcher()) return;
      if (closeCommandPalette()) return;
      if (focusManagerRef?.exitAllModes()) return;
      closeModal();
      return;
    }

    if (!ctrl) return;

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

    // Ctrl+N — New document (with dirty check)
    if (key === 'n' && !shift) {
      e.preventDefault();
      if (documentStore.isDirty()) {
        confirmModal('You have unsaved changes. Create a new document anyway?', { title: 'Unsaved Changes', okText: 'New Document', danger: true })
          .then(ok => { if (ok) documentStore.newDocument(); })
          .catch(() => {});
      } else {
        documentStore.newDocument();
      }
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

    // Ctrl+O — Open file from disk (or toggle sidebar if unsupported)
    if (key === 'o' && !shift) {
      e.preventDefault();
      if (localFs.isSupported()) {
        fileSaver.openFile();
      } else {
        toggleSidebar();
      }
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

    // Ctrl+P — Quick file switcher
    if (key === 'p' && !shift) {
      e.preventDefault();
      openFileSwitcher();
      return;
    }

    // Ctrl+Shift+G — Knowledge graph (only when folder linked)
    if (key === 'g' && shift) {
      e.preventDefault();
      if (localSync.isLinked()) {
        import('../graph/graph-view.js').then(m => m.openGraphView());
      }
      return;
    }

    // Ctrl+U — Toggle source view
    if (key === 'u' && !shift) {
      e.preventDefault();
      settingsStore.set('sourceMode', !settingsStore.get('sourceMode'));
      return;
    }

    // Ctrl+\ — Toggle split pane
    if (e.code === 'Backslash' && !shift) {
      e.preventDefault();
      import('../editor/split-pane.js').then(m => m.toggleSplitPane());
      return;
    }

  });
}
