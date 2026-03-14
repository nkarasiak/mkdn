import { el, injectStyles } from '../utils/dom.js';
import { icons } from '../toolbar/toolbar-icons.js';
import { historyManager } from './history-manager.js';
import { documentStore } from '../store/document-store.js';
import { eventBus } from '../store/event-bus.js';
import { confirm as confirmModal } from '../ui/modal.js';
import { computeDiff, collapseDiff } from './diff.js';
import { collabManager } from '../collab/collab-manager.js';

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
      title: 'Diff',
      unsafeHTML: icons.diff,
      onClick: (e) => { e.stopPropagation(); showDiff(snap); },
    }),
    el('button', {
      className: 'toolbar-btn history-action-btn',
      title: 'Preview',
      unsafeHTML: icons.eye,
      onClick: (e) => { e.stopPropagation(); showPreview(snap); },
    }),
    el('button', {
      className: 'toolbar-btn history-action-btn',
      title: 'Restore',
      unsafeHTML: icons.restore,
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

function showDiff(snap) {
  const oldText = snap.content;
  const newText = documentStore.getMarkdown();
  const raw = computeDiff(oldText, newText);
  const entries = collapseDiff(raw, 3);

  const diffBody = el('div', { className: 'diff-body' });
  for (const entry of entries) {
    if (entry.type === 'collapse') {
      diffBody.appendChild(el('div', { className: 'diff-line diff-collapse' },
        `... ${entry.count} unchanged line${entry.count !== 1 ? 's' : ''} ...`));
    } else {
      const prefix = entry.type === 'add' ? '+' : entry.type === 'remove' ? '-' : ' ';
      diffBody.appendChild(el('div', { className: `diff-line diff-${entry.type}` },
        `${prefix} ${entry.line}`));
    }
  }

  const overlay = el('div', { className: 'modal-overlay modal-open' });
  const modal = el('div', { className: 'modal diff-modal' },
    el('div', { className: 'modal-header' },
      `Changes since ${formatTime(snap.timestamp)}`),
    el('div', { className: 'modal-body' }, diffBody),
    el('div', { className: 'modal-footer' },
      el('button', {
        className: 'modal-btn',
        onClick: () => overlay.remove(),
      }, 'Close'),
    ),
  );

  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.addEventListener('modal:close', close);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
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

function createCollabSnapshotItem(snap) {
  const triggerText = TRIGGER_LABELS[snap.trigger] || snap.trigger;
  const label = snap.userName ? `${triggerText} by ${snap.userName}` : triggerText;

  const actions = el('div', { className: 'history-item-actions' },
    el('button', {
      className: 'toolbar-btn history-action-btn',
      title: 'Diff',
      unsafeHTML: icons.diff,
      onClick: (e) => { e.stopPropagation(); showDiff(snap); },
    }),
    el('button', {
      className: 'toolbar-btn history-action-btn',
      title: 'Preview',
      unsafeHTML: icons.eye,
      onClick: (e) => { e.stopPropagation(); showPreview(snap); },
    }),
    el('button', {
      className: 'toolbar-btn history-action-btn',
      title: 'Restore',
      unsafeHTML: icons.restore,
      onClick: (e) => { e.stopPropagation(); restoreCollabSnapshot(snap); },
    }),
  );

  const infoChildren = [
    el('span', { className: 'history-item-time' }, formatTime(snap.timestamp)),
    el('span', { className: 'history-item-trigger collab-trigger' }, label),
  ];
  if (snap.message) {
    infoChildren.push(el('span', { className: 'history-item-message' }, snap.message));
  }

  return el('div', { className: 'history-item is-collab' },
    el('div', { className: 'history-item-info' }, ...infoChildren),
    actions,
  );
}

async function restoreCollabSnapshot(snap) {
  try {
    const ok = await confirmModal(
      `Restore shared snapshot from ${formatTime(snap.timestamp)}? This will replace your current content.`,
      { title: 'Restore Shared Version', okText: 'Restore' },
    );
    if (ok) {
      documentStore.setMarkdown(snap.content, 'history-restore');
      eventBus.emit('history:restored', {});
    }
  } catch { /* cancelled */ }
}

async function renderList() {
  if (!listEl) return;
  listEl.replaceChildren();

  const fileKey = historyManager.getFileKey();
  const snapshots = await historyManager.getHistory(fileKey);

  // Local history section
  if (snapshots.length > 0) {
    if (collabManager.isActive()) {
      listEl.appendChild(el('div', { className: 'history-section-header' }, 'Local'));
    }
    for (const snap of snapshots) {
      listEl.appendChild(createSnapshotItem(snap));
    }
  }

  // Shared collab history section
  if (collabManager.isActive()) {
    const collabSnapshots = await historyManager.getCollabHistory();
    listEl.appendChild(el('div', { className: 'history-section-header' }, 'Shared'));
    if (collabSnapshots.length > 0) {
      for (const snap of collabSnapshots) {
        listEl.appendChild(createCollabSnapshotItem(snap));
      }
    } else {
      listEl.appendChild(
        el('div', { className: 'sidebar-empty' }, 'No shared history yet'),
      );
    }
  }

  // Empty state when no history at all and not collaborating
  if (snapshots.length === 0 && !collabManager.isActive()) {
    listEl.appendChild(
      el('div', { className: 'sidebar-empty' }, 'No history for this file'),
    );
  }
}

export function createHistoryPanel() {
  listEl = el('div', { className: 'history-list' });

  eventBus.on('file:opened', () => renderList());
  eventBus.on('file:new', () => renderList());
  eventBus.on('file:saved', () => renderList());
  eventBus.on('history:restored', () => renderList());
  eventBus.on('history:updated', () => renderList());
  eventBus.on('collab:started', () => renderList());
  eventBus.on('collab:stopped', () => renderList());

  // Initial render (deferred so the DOM is ready)
  setTimeout(renderList, 0);

  return listEl;
}

// Inject history panel styles
injectStyles(`
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
.history-section-header {
  padding: 6px 12px 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-tertiary);
  border-bottom: 1px solid var(--border-light);
}
.history-item.is-collab {
  border-left: 3px solid var(--collab-color);
}
.history-item-trigger.collab-trigger {
  color: var(--collab-color);
}
.diff-modal {
  max-width: 720px;
  width: 90vw;
}
.diff-body {
  max-height: 400px;
  overflow: auto;
  font-family: var(--font-mono, monospace);
  font-size: var(--font-size-sm);
  line-height: 1.6;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
}
.diff-line {
  padding: 1px 12px;
  white-space: pre-wrap;
  word-break: break-all;
}
.diff-add {
  background: color-mix(in srgb, #22c55e 15%, transparent);
  color: var(--text-primary);
}
.diff-remove {
  background: color-mix(in srgb, #ef4444 15%, transparent);
  color: var(--text-primary);
}
.diff-same {
  color: var(--text-secondary);
}
.diff-collapse {
  color: var(--text-tertiary);
  font-style: italic;
  text-align: center;
  padding: 4px 12px;
  background: var(--bg-tertiary, var(--bg-secondary));
}
`);
