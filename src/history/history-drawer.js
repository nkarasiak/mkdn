import { el } from '../utils/dom.js';
import { icons } from '../toolbar/toolbar-icons.js';
import { historyManager } from './history-manager.js';
import { documentStore } from '../store/document-store.js';
import { eventBus } from '../store/event-bus.js';
import { confirm as confirmModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';

let drawerEl = null;
let overlayEl = null;
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
  const isCheckpoint = snap.trigger === 'checkpoint';

  const actions = el('div', { className: 'hdrawer-item-actions' },
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
    el('span', { className: 'hdrawer-item-time' }, formatTime(snap.timestamp)),
    el('span', { className: `hdrawer-item-trigger${isCheckpoint ? ' checkpoint' : ''}` },
      TRIGGER_LABELS[snap.trigger] || snap.trigger),
  ];

  if (snap.message) {
    infoChildren.push(
      el('span', { className: 'hdrawer-item-message' }, snap.message),
    );
  }

  return el('div', { className: `hdrawer-item${isCheckpoint ? ' is-checkpoint' : ''}` },
    el('div', { className: 'hdrawer-item-info' }, ...infoChildren),
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

  const title = snap.message
    ? `${snap.fileName} — ${snap.message}`
    : `${snap.fileName} — ${formatTime(snap.timestamp)}`;

  const modal = el('div', { className: 'modal history-preview-modal' },
    el('div', { className: 'modal-header' }, title),
    el('div', { className: 'modal-body' }, textarea),
    el('div', { className: 'modal-footer' },
      el('button', { className: 'modal-btn', onClick: () => overlay.remove() }, 'Close'),
    ),
  );

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

async function restoreSnapshot(snap) {
  try {
    const label = snap.message || formatTime(snap.timestamp);
    const ok = await confirmModal(
      `Restore "${snap.fileName}" from ${label}? This will replace your current content.`,
      { title: 'Restore Version', okText: 'Restore' },
    );
    if (ok) {
      await historyManager.restoreSnapshot(snap.id);
      toast('Version restored', 'info');
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
      el('div', { className: 'hdrawer-empty' }, 'No history for this file yet'),
    );
    return;
  }

  for (const snap of snapshots) {
    listEl.appendChild(createSnapshotItem(snap));
  }
}

async function doCreateCheckpoint(messageInput) {
  if (!documentStore.getMarkdown()) {
    toast('Nothing to checkpoint', 'warning');
    return;
  }
  const message = messageInput.value.trim();
  await historyManager.createCheckpoint(message || null);
  messageInput.value = '';
  toast('Checkpoint created', 'info');
}

export function createHistoryDrawer() {
  const messageInput = el('input', {
    type: 'text',
    placeholder: 'Checkpoint message (optional)',
    className: 'hdrawer-input',
  });
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doCreateCheckpoint(messageInput);
  });

  const checkpointBtn = el('button', {
    className: 'hdrawer-checkpoint-btn',
    onClick: () => doCreateCheckpoint(messageInput),
  },
    el('span', { html: icons.plus }),
    'Checkpoint',
  );

  const checkpointSection = el('div', { className: 'hdrawer-checkpoint' },
    messageInput,
    checkpointBtn,
  );

  listEl = el('div', { className: 'hdrawer-list' });

  overlayEl = el('div', { className: 'hdrawer-overlay' });
  overlayEl.addEventListener('click', () => toggleHistoryDrawer(false));

  drawerEl = el('div', { className: 'hdrawer' },
    el('div', { className: 'hdrawer-header' },
      el('span', { className: 'hdrawer-title' }, 'History'),
      el('button', {
        className: 'toolbar-btn',
        html: icons.x,
        onClick: () => toggleHistoryDrawer(false),
      }),
    ),
    checkpointSection,
    listEl,
  );

  // Re-render on relevant events
  eventBus.on('file:opened', () => renderList());
  eventBus.on('file:new', () => renderList());
  eventBus.on('file:saved', () => renderList());
  eventBus.on('history:restored', () => renderList());
  eventBus.on('history:updated', () => renderList());

  setTimeout(renderList, 0);

  return { drawerEl, overlayEl };
}

export function toggleHistoryDrawer(force) {
  const open = force !== undefined ? force : !drawerEl?.classList.contains('open');
  drawerEl?.classList.toggle('open', open);
  overlayEl?.classList.toggle('visible', open);
}

// Inject styles
const style = document.createElement('style');
style.textContent = `
.hdrawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 320px;
  max-width: 90vw;
  background: var(--bg-primary);
  border-left: 1px solid var(--border-color);
  box-shadow: var(--shadow-lg);
  z-index: 150;
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  transition: transform var(--transition-normal);
}
.hdrawer.open {
  transform: translateX(0);
}
.hdrawer-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: var(--bg-overlay);
  z-index: 149;
}
.hdrawer-overlay.visible {
  display: block;
}
.hdrawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}
.hdrawer-title {
  font-family: var(--font-sans);
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-primary);
}
.hdrawer-checkpoint {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}
.hdrawer-input {
  flex: 1;
  padding: 6px 10px;
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
  color: var(--text-primary);
  outline: none;
  transition: border-color var(--transition-fast);
  min-width: 0;
}
.hdrawer-input:focus {
  border-color: var(--accent);
}
.hdrawer-checkpoint-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--accent-text);
  background: var(--accent);
  border-radius: var(--radius-sm);
  white-space: nowrap;
  transition: background var(--transition-fast);
  flex-shrink: 0;
}
.hdrawer-checkpoint-btn:hover {
  background: var(--accent-hover);
}
.hdrawer-checkpoint-btn svg {
  width: 14px;
  height: 14px;
}
.hdrawer-list {
  flex: 1;
  overflow-y: auto;
}
.hdrawer-empty {
  padding: 32px 16px;
  text-align: center;
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}
.hdrawer-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-light);
  transition: background var(--transition-fast);
}
.hdrawer-item:hover {
  background: var(--bg-hover);
}
.hdrawer-item.is-checkpoint {
  border-left: 3px solid var(--accent);
}
.hdrawer-item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.hdrawer-item-time {
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hdrawer-item-trigger {
  font-family: var(--font-sans);
  font-size: 11px;
  color: var(--text-tertiary, var(--text-muted));
}
.hdrawer-item-trigger.checkpoint {
  color: var(--accent);
  font-weight: 600;
}
.hdrawer-item-message {
  font-family: var(--font-sans);
  font-size: 11px;
  color: var(--text-secondary);
  font-style: italic;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hdrawer-item-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity var(--transition-fast);
  flex-shrink: 0;
}
.hdrawer-item:hover .hdrawer-item-actions {
  opacity: 1;
}
@media (max-width: 768px) {
  .hdrawer {
    width: 100%;
    max-width: 100vw;
  }
}
`;
document.head.appendChild(style);
