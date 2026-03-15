import { el, injectStyles } from '../utils/dom.js';
import { icons } from './toolbar-icons.js';
import { tabStore } from '../store/tab-store.js';
import { documentStore } from '../store/document-store.js';
import { eventBus } from '../store/event-bus.js';

let barEl = null;
let dragFromIdx = null;

function renderTabs() {
  if (!barEl) return;
  barEl.replaceChildren();

  const tabs = tabStore.getTabs();
  const activeId = tabStore.getActiveTabId();

  if (tabs.length <= 1) {
    barEl.style.display = 'none';
    return;
  }

  barEl.style.display = '';

  tabs.forEach((tab, idx) => {
    const isActive = tab.id === activeId;

    const closeBtn = el('button', {
      className: 'tab-close',
      'aria-label': 'Close tab',
      unsafeHTML: icons.x,
      onMousedown: (e) => e.stopPropagation(),
      onClick: (e) => {
        e.stopPropagation();
        const next = tabStore.closeTab(tab.id);
        if (next) {
          documentStore.setFile(next.id, next.name, next.content, next.source);
        } else {
          documentStore.newDocument();
        }
      },
    });

    const label = tab.name.replace(/\.md$/i, '');
    const tabEl = el('div', {
      className: `tab-item${isActive ? ' active' : ''}${tab.dirty ? ' dirty' : ''}`,
      draggable: 'true',
      dataset: { idx: String(idx) },
      onClick: () => {
        const switched = tabStore.switchTab(tab.id);
        if (switched) {
          documentStore.setFile(switched.id, switched.name, switched.content, switched.source);
        }
      },
    },
      el('span', { className: 'tab-label' }, label),
      tab.dirty ? el('span', { className: 'tab-dirty-dot' }) : null,
      closeBtn,
    );

    // Drag-and-drop reorder
    tabEl.addEventListener('dragstart', (e) => {
      dragFromIdx = idx;
      tabEl.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    tabEl.addEventListener('dragend', () => {
      tabEl.classList.remove('dragging');
      dragFromIdx = null;
    });
    tabEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    tabEl.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragFromIdx !== null && dragFromIdx !== idx) {
        tabStore.reorder(dragFromIdx, idx);
      }
    });

    barEl.appendChild(tabEl);
  });
}

export function createTabBar() {
  barEl = el('div', { className: 'tab-bar' });
  barEl.style.display = 'none';

  eventBus.on('tabs:changed', renderTabs);
  renderTabs();

  return barEl;
}

/**
 * Initialize tab store integration with document events.
 * Call this after milkdown init.
 */
export function initTabs() {
  // When a file is opened externally (sidebar, file picker), create/switch tab
  eventBus.on('file:opened', ({ id, name, source }) => {
    const content = documentStore.getMarkdown();
    tabStore.openTab(id || name, name, content, source);
  });

  // New document → create tab
  eventBus.on('file:new', () => {
    const id = 'untitled-' + Date.now();
    tabStore.openTab(id, 'Untitled.md', '', null);
  });

  // Track dirty state
  eventBus.on('content:changed', ({ source }) => {
    if (source === 'file-open' || source === 'new-document' || source === 'session-restore') return;
    tabStore.markDirty();
  });

  // Track saves
  eventBus.on('file:saved', () => tabStore.markSaved());
  eventBus.on('sync:saved', () => tabStore.markSaved());

  // Track renames
  eventBus.on('file:renamed', ({ name }) => {
    const id = tabStore.getActiveTabId();
    if (id) tabStore.updateName(id, name);
  });
}

injectStyles(`
.tab-bar {
  display: flex;
  align-items: stretch;
  height: 34px;
  background: var(--toolbar-bg);
  border-bottom: 1px solid var(--border-light);
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.tab-bar::-webkit-scrollbar { display: none; }

.tab-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  min-width: 0;
  max-width: 180px;
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  cursor: pointer;
  border-right: 1px solid var(--border-light);
  transition: background var(--transition-fast), color var(--transition-fast);
  white-space: nowrap;
  flex-shrink: 0;
  position: relative;
}

.tab-item:hover {
  background: var(--bg-hover);
  color: var(--text-secondary);
}

.tab-item.active {
  color: var(--text-primary);
  background: var(--bg-primary);
  border-bottom: 2px solid var(--accent);
}

.tab-item.dragging {
  opacity: 0.5;
}

.tab-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-dirty-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
  flex-shrink: 0;
}

.tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 3px;
  color: var(--text-muted);
  opacity: 0;
  transition: opacity var(--transition-fast), background var(--transition-fast);
  flex-shrink: 0;
}

.tab-item:hover .tab-close {
  opacity: 1;
}

.tab-close:hover {
  background: var(--bg-active);
  color: var(--text-primary);
}

.tab-close svg {
  width: 10px;
  height: 10px;
}
`);
