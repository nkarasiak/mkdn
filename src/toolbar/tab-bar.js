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

  // Hide the entire tab bar when there's only one tab
  barEl.style.display = tabs.length <= 1 ? 'none' : '';

  tabs.forEach((tab, idx) => {
    const isActive = tab.id === activeId;

    const canClose = tabs.length > 1;
    const closeBtn = el('button', {
      className: 'tab-close',
      'aria-label': 'Close tab',
      unsafeHTML: icons.x,
      style: canClose ? {} : { display: 'none' },
      onMousedown: (e) => e.stopPropagation(),
      onClick: (e) => {
        e.stopPropagation();
        if (tabs.length <= 1) return; // never close the last tab
        const next = tabStore.closeTab(tab.id);
        if (next) {
          documentStore.setFile(next.id, next.name, next.content, next.source);
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

    // Double-click to rename
    tabEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const labelEl = tabEl.querySelector('.tab-label');
      if (!labelEl) return;

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'tab-rename-input';
      input.value = tab.name.replace(/\.md$/i, '');

      const commit = () => {
        const raw = input.value.trim();
        if (raw && raw !== label) {
          const newName = raw.endsWith('.md') ? raw : raw + '.md';
          tabStore.updateName(tab.id, newName);
          documentStore.setFileName(newName);
        }
        renderTabs();
      };

      input.addEventListener('keydown', (ke) => {
        if (ke.key === 'Enter') { ke.preventDefault(); commit(); }
        if (ke.key === 'Escape') { ke.preventDefault(); renderTabs(); }
      });
      input.addEventListener('blur', commit);

      labelEl.replaceWith(input);
      input.focus();
      input.select();
    });

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

  // "New tab" button
  const newTabBtn = el('button', {
    className: 'tab-new-btn',
    'aria-label': 'New tab',
    unsafeHTML: icons.plus,
    onClick: () => documentStore.newDocument(),
  });
  barEl.appendChild(newTabBtn);
}

export function createTabBar() {
  barEl = el('div', { className: 'tab-bar' });

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

.tab-rename-input {
  background: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--accent);
  border-radius: 3px;
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  padding: 0 4px;
  width: 100%;
  min-width: 40px;
  outline: none;
}

.tab-new-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  flex-shrink: 0;
  color: var(--text-muted);
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.tab-new-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.tab-new-btn svg {
  width: 14px;
  height: 14px;
}
`);
