import { el } from '../utils/dom.js';
import { icons } from '../toolbar/toolbar-icons.js';
import { historyManager } from './history-manager.js';
import { documentStore } from '../store/document-store.js';
import { eventBus } from '../store/event-bus.js';
import { confirm as confirmModal } from '../ui/modal.js';

let listEl = null;

const TRIGGER_LABELS = {
  save: 'Manual save',
  autosave: 'Auto-save',
  periodic: 'Periodic',
  'before-switch': 'Before switch',
  checkpoint: 'Checkpoint',
};

function formatTime(ts) {
  const now = Date.now();
  const diff = now - ts;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const d = new Date(ts);
    return `Today ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
  const days = Math.floor(hours / 24);
  if (days === 1) {
    const d = new Date(ts);
    return `Yesterday ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
  const d = new Date(ts);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ', ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function createSnapshotItem(snap) {
  const actions = el('div', { className: 'history-item-actions' },
    el('button', {
      className: 'toolbar-btn history-action-btn',
      'data-tooltip': 'Preview',
      html: icons.eye,
      onClick: (e) => { e.stopPropagation(); showPreview(snap); },
    }),
    el('button', {
      className: 'toolbar-btn history-action-btn',
      'data-tooltip': 'Restore',
      html: icons.restore,
      onClick: (e) => { e.stopPropagation(); restoreSnapshot(snap); },
    }),
  );

  const infoChildren = [
    el('span', { className: 'history-item-time' }, formatTime(snap.timestamp)),
    el('span', { className: `history-item-trigger${snap.trigger === 'checkpoint' ? ' checkpoint' : ''}` },
      TRIGGER_LABELS[snap.trigger] || snap.trigger),
  ];
  if (snap.message) {
    infoChildren.push(el('span', { className: 'history-item-message' }, snap.message));
  }

  return el('div', { className: `history-item${snap.trigger === 'checkpoint' ? ' is-checkpoint' : ''}` },
    el('div', { className: 'history-item-info' }, ...infoChildren),
    actions,
  );
}

function showPreview(snap) {
  const overlay = el('div', { className: 'modal-overlay modal-open' });
  const textarea = el('textarea', {
    className: 'history-preview-textarea',
    readOnly: true,
  });
  textarea.value = snap.content;

  const modal = el('div', { className: 'modal history-preview-modal' },
    el('div', { className: 'modal-header' },
      `${snap.fileName} — ${formatTime(snap.timestamp)}`,
    ),
    el('div', { className: 'modal-body' }, textarea),
    el('div', { className: 'modal-footer' },
      el('button', {
        className: 'modal-btn',
        onClick: () => overlay.remove(),
      }, 'Close'),
    ),
  );

  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  overlay.addEventListener('modal:close', close);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

async function restoreSnapshot(snap) {
  try {
    const ok = await confirmModal(
      `Restore "${snap.fileName}" from ${formatTime(snap.timestamp)}? This will replace your current content.`,
      { title: 'Restore Version', okText: 'Restore' },
    );
    if (ok) {
      await historyManager.restoreSnapshot(snap.id);
    }
  } catch { /* cancelled */ }
}

async function renderList() {
  if (!listEl) return;
  listEl.innerHTML = '';

  const fileKey = historyManager.getFileKey();
  const snapshots = await historyManager.getHistory(fileKey);

  if (snapshots.length === 0) {
    listEl.appendChild(
      el('div', { className: 'sidebar-empty' }, 'No history for this file'),
    );
    return;
  }

  for (const snap of snapshots) {
    listEl.appendChild(createSnapshotItem(snap));
  }
}

export function createHistoryPanel() {
  listEl = el('div', { className: 'history-list' });

  eventBus.on('file:opened', () => renderList());
  eventBus.on('file:new', () => renderList());
  eventBus.on('file:saved', () => renderList());
  eventBus.on('history:restored', () => renderList());
  eventBus.on('history:updated', () => renderList());

  // Initial render (deferred so the DOM is ready)
  setTimeout(renderList, 0);

  return listEl;
}

// Inject history panel styles
const style = document.createElement('style');
style.textContent = `
.history-list {
  display: flex;
  flex-direction: column;
}
.history-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-light);
  transition: background var(--transition-fast);
}
.history-item:hover {
  background: var(--bg-hover);
}
.history-item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.history-item-time {
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.history-item-trigger {
  font-size: 11px;
  color: var(--text-tertiary);
}
.history-item-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity var(--transition-fast);
}
.history-item:hover .history-item-actions {
  opacity: 1;
}
.history-action-btn {
  width: 24px;
  height: 24px;
  padding: 0;
}
.history-action-btn svg {
  width: 14px;
  height: 14px;
}
.history-preview-modal {
  max-width: 640px;
}
.history-preview-textarea {
  width: 100%;
  height: 300px;
  resize: vertical;
  font-family: var(--font-mono, monospace);
  font-size: var(--font-size-sm);
  padding: 12px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  color: var(--text-primary);
}
.history-item.is-checkpoint {
  border-left: 3px solid var(--accent);
}
.history-item-trigger.checkpoint {
  color: var(--accent);
  font-weight: 600;
}
.history-item-message {
  font-size: 11px;
  color: var(--text-secondary);
  font-style: italic;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
`;
document.head.appendChild(style);
