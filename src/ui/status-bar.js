import { el, svgIcon, injectStyles } from '../utils/dom.js';
import { icons } from '../toolbar/toolbar-icons.js';
import { documentStore } from '../store/document-store.js';
import { eventBus } from '../store/event-bus.js';
import { settingsStore } from '../store/settings-store.js';
import { buildAboutContent } from './about-content.js';

export function createStatusBar({ onToggleHistory, focusManager } = {}) {
  // --- Save state dot (solid = saved, hollow = dirty) ---
  const saveDot = el('button', {
    className: 'statusbar-save-dot',
    'aria-label': 'Document save state',
    'data-tooltip': 'Saved',
    onClick: () => togglePopover(),
  });

  function updateSaveDot() {
    const dirty = documentStore.isDirty();
    saveDot.classList.toggle('dirty', dirty);
    saveDot.setAttribute('data-tooltip', dirty ? 'Unsaved changes' : 'Saved');
  }
  eventBus.on('content:changed', updateSaveDot);
  eventBus.on('file:saved', updateSaveDot);
  eventBus.on('file:opened', updateSaveDot);
  eventBus.on('file:new', updateSaveDot);
  updateSaveDot();

  // --- Word count (single number, click → details) ---
  const wordsEl = el('button', {
    className: 'statusbar-words',
    'aria-label': 'Writing statistics',
    'data-tooltip': 'Open writing statistics',
    onClick: () => import('../stats/writing-stats.js').then(m => m.openWritingStats()),
  }, '0');

  function updateStats() {
    const { words } = getStats(documentStore.getMarkdown());
    wordsEl.textContent = String(words);
  }
  eventBus.on('content:changed', updateStats);
  eventBus.on('file:opened', updateStats);
  eventBus.on('file:new', updateStats);
  updateStats();

  // --- Collab peer badge (only visible when active) ---
  const peerBadge = el('span', {
    className: 'statusbar-peer-badge',
    style: { display: 'none' },
    'data-tooltip': 'Live collaborators',
  }, '0');
  eventBus.on('collab:started', () => { peerBadge.style.display = ''; });
  eventBus.on('collab:stopped', () => { peerBadge.style.display = 'none'; });
  eventBus.on('collab:peers-changed', ({ peers } = {}) => {
    const n = peers?.length ?? 0;
    peerBadge.textContent = String(n);
  });

  // --- Focus mode pill (only when active) ---
  const focusPill = el('span', { className: 'statusbar-focus-pill', style: { display: 'none' } });
  function updateFocusPill() {
    if (focusManager?.isActive()) {
      focusPill.textContent = focusManager.getCurrentModeLabel();
      focusPill.style.display = '';
    } else {
      focusPill.style.display = 'none';
    }
  }
  eventBus.on('settings:zenMode', updateFocusPill);
  eventBus.on('settings:writingMode', updateFocusPill);
  eventBus.on('settings:paragraphFocus', updateFocusPill);
  eventBus.on('settings:typewriterMode', updateFocusPill);
  updateFocusPill();

  // --- Expand button → popover ---
  const expandBtn = el('button', {
    className: 'statusbar-expand-btn',
    'aria-label': 'More options',
    'data-tooltip': 'More options',
    unsafeHTML: icons.infoCircle || `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>`,
    onClick: () => togglePopover(),
  });

  // Replace icon with horizontal dots for less noise
  expandBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>';

  // --- Popover with secondary controls ---
  let popover = null;
  let folderLinked = false;
  eventBus.on('local:folder-linked', () => { folderLinked = true; });
  eventBus.on('local:folder-unlinked', () => { folderLinked = false; });

  function buildPopover() {
    const { words } = getStats(documentStore.getMarkdown());
    const readTime = Math.max(1, Math.ceil(words / 200));

    const rows = [];

    rows.push(
      el('div', { className: 'sb-popover-stats' },
        el('span', {}, `${words} word${words !== 1 ? 's' : ''}`),
        el('span', { className: 'sb-popover-stats-dot' }, '·'),
        el('span', {}, `${readTime} min read`),
      ),
    );

    function action(label, shortcut, onClick) {
      return el('button', { className: 'sb-popover-row', onClick: () => { onClick(); closePopover(); } },
        el('span', { className: 'sb-popover-row-label' }, label),
        shortcut ? el('span', { className: 'sb-popover-row-kbd' }, shortcut) : '',
      );
    }

    rows.push(action('Writing statistics', '', () => import('../stats/writing-stats.js').then(m => m.openWritingStats())));
    rows.push(action('Reader view', 'Ctrl+Shift+E', () => import('./reader-view.js').then(m => m.openReaderView())));
    rows.push(action('Focus mode', 'Ctrl+Shift+F', () => focusManager?.cycleMode()));
    rows.push(action(
      settingsStore.get('fullWidth') ? 'Disable full width' : 'Enable full width',
      '',
      () => settingsStore.set('fullWidth', !settingsStore.get('fullWidth')),
    ));
    rows.push(action('History', 'Ctrl+Shift+H', () => onToggleHistory?.()));
    if (folderLinked) {
      rows.push(action('Knowledge graph', 'Ctrl+Shift+G', () => import('../graph/graph-view.js').then(m => m.openGraphView())));
    }
    rows.push(action('About & shortcuts', '', async () => {
      const { showInfo } = await import('./modal.js');
      showInfo('About mkdn', buildAboutContent());
    }));

    return el('div', { className: 'statusbar-popover' }, ...rows);
  }

  function togglePopover() {
    if (popover) { closePopover(); return; }
    popover = buildPopover();
    document.body.appendChild(popover);
    requestAnimationFrame(() => {
      const rect = expandBtn.getBoundingClientRect();
      popover.style.right = `${window.innerWidth - rect.right}px`;
      popover.style.bottom = `${window.innerHeight - rect.top + 6}px`;
      popover.classList.add('open');
    });
    setTimeout(() => {
      document.addEventListener('click', outsideClick, true);
    }, 0);
  }

  function closePopover() {
    if (!popover) return;
    popover.classList.remove('open');
    document.removeEventListener('click', outsideClick, true);
    const p = popover;
    popover = null;
    setTimeout(() => p.remove(), 160);
  }

  function outsideClick(e) {
    if (popover && !popover.contains(e.target) && e.target !== expandBtn && !expandBtn.contains(e.target)) {
      closePopover();
    }
  }

  // statusbar-left kept so initWritingGoals can attach goal progress UI
  const statusEl = el('div', { className: 'statusbar statusbar-quiet' },
    el('div', { className: 'statusbar-left' },
      saveDot,
      wordsEl,
      peerBadge,
    ),
    el('div', { className: 'statusbar-right' },
      focusPill,
      expandBtn,
    ),
  );

  return statusEl;
}

function getStats(md) {
  if (!md) return { words: 0, lines: 0 };
  const text = md.trim();
  const words = text ? text.split(/\s+/).length : 0;
  const lines = text ? text.split('\n').length : 0;
  return { words, lines };
}

injectStyles(`
.statusbar-quiet {
  height: 28px !important;
  padding: 0 12px;
  background: transparent;
  pointer-events: auto;
}

.statusbar-quiet .statusbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.statusbar-quiet .statusbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.statusbar-save-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--success, #4caf50);
  transition: background 0.18s ease, transform 0.18s ease;
  flex-shrink: 0;
  padding: 0;
  border: none;
  cursor: pointer;
}

.statusbar-save-dot:hover {
  transform: scale(1.18);
}

.statusbar-save-dot.dirty {
  background: transparent;
  box-shadow: inset 0 0 0 1.5px var(--text-muted);
}

.statusbar-words {
  font-family: var(--font-sans);
  font-size: 11px;
  color: var(--text-muted);
  background: none;
  padding: 2px 4px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  border: none;
  transition: color 0.15s ease, background 0.15s ease;
}

.statusbar-words:hover {
  color: var(--text-secondary);
  background: var(--bg-hover);
}

.statusbar-peer-badge {
  font-family: var(--font-sans);
  font-size: 10px;
  font-weight: 600;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  padding: 1px 6px;
  border-radius: 999px;
  min-width: 14px;
  text-align: center;
}

.statusbar-focus-pill {
  font-family: var(--font-sans);
  font-size: 10px;
  font-weight: 500;
  color: var(--accent);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.statusbar-expand-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: none;
  border: none;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.statusbar-expand-btn svg {
  width: 16px;
  height: 16px;
}

.statusbar-expand-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

/* Popover */
.statusbar-popover {
  position: fixed;
  min-width: 220px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg, 0 8px 28px rgba(0, 0, 0, 0.18));
  padding: 6px;
  z-index: 200;
  opacity: 0;
  transform: translateY(4px) scale(0.98);
  transition: opacity 0.14s ease, transform 0.14s ease;
  pointer-events: auto;
  font-family: var(--font-sans);
}

.statusbar-popover.open {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.sb-popover-stats {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px 8px;
  font-size: 11px;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border-light);
  margin-bottom: 4px;
}

.sb-popover-stats-dot { opacity: 0.6; }

.sb-popover-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 7px 10px;
  width: 100%;
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--text-primary);
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s ease;
}

.sb-popover-row:hover {
  background: var(--bg-hover);
}

.sb-popover-row-label {
  flex: 1;
}

.sb-popover-row-kbd {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  background: var(--bg-tertiary);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
}

/* Override variable so layout.css's statusbar-height does not stretch the bar */
.app-statusbar:has(.statusbar-quiet) {
  --statusbar-height: 28px;
}
`);
