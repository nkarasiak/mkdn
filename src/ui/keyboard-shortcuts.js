import { documentStore } from '../store/document-store.js';
import { fileSaver } from '../save/file-saver.js';
import { settingsStore } from '../store/settings-store.js';
import { closeModal } from '../ui/modal.js';
import { openFindBar, closeFindBar } from '../find-replace/find-bar.js';
import { editorZoom } from '../editor/editor-zoom.js';
import { tabStore } from '../store/tab-store.js';
import { printDocument } from '../utils/export.js';
import { isTauri } from '../platform/tauri-bridge.js';

function activate(tab) {
  if (tab) documentStore.setFile(tab.id, tab.name, tab.content, tab.source);
}

// key → action, keyed as "[shift+]key" (Ctrl/Cmd is implied)
const bindings = {
  's': () => fileSaver.save(),
  'shift+s': () => fileSaver.saveAs(),
  'o': () => fileSaver.openFile(),
  'n': () => documentStore.newDocument(),
  't': () => documentStore.newDocument(),
  'shift+t': () => activate(tabStore.reopenTab()),
  'w': () => activate(tabStore.closeTab(tabStore.getActiveTabId())),
  'tab': () => activate(tabStore.nextTab()),
  'shift+tab': () => activate(tabStore.prevTab()),
  'l': () => import('../ui/link-popover.js').then(m => m.openLinkPopover()),
  'f': () => openFindBar(false),
  'h': () => openFindBar(true),
  'shift+h': () => import('../history/history-panel.js').then(m => m.openHistory()),
  'p': () => printDocument(),
  'u': () => settingsStore.set('sourceMode', !settingsStore.get('sourceMode')),
  '=': () => editorZoom.zoomIn(),
  '+': () => editorZoom.zoomIn(),
  'shift++': () => editorZoom.zoomIn(),
  '-': () => editorZoom.zoomOut(),
  '0': () => editorZoom.reset(),
  'q': () => {
    if (isTauri()) import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().close());
  },
};

export function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!closeFindBar()) closeModal();
      return;
    }
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const action = bindings[(e.shiftKey ? 'shift+' : '') + e.key.toLowerCase()];
    if (!action) return;
    e.preventDefault();
    action();
  });
}
