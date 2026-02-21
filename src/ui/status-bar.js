import { el } from '../utils/dom.js';
import { icons } from '../toolbar/toolbar-icons.js';
import { documentStore } from '../store/document-store.js';
import { eventBus } from '../store/event-bus.js';
import { settingsStore } from '../store/settings-store.js';

export function createStatusBar({ onToggleHistory, focusManager } = {}) {
  // Left side: file name + stats + history button
  const fileNameEl = el('span', { className: 'statusbar-stats' }, documentStore.getFileName());
  const statsEl = el('span', { className: 'statusbar-stats' }, '0 words');

  const historyBtn = el('button', {
    className: 'statusbar-icon-btn',
    'data-tooltip': 'History (Ctrl+Shift+H)',
    html: icons.clock,
    onClick: () => onToggleHistory?.(),
  });

  function updateStats() {
    const { words } = getStats(documentStore.getMarkdown());
    const readTime = Math.max(1, Math.ceil(words / 200));
    statsEl.textContent = `${words} word${words !== 1 ? 's' : ''}  ·  ${readTime} min read`;
  }

  function updateFileName() {
    fileNameEl.textContent = documentStore.getFileName();
  }

  eventBus.on('content:changed', updateStats);
  eventBus.on('file:opened', () => { updateStats(); updateFileName(); });
  eventBus.on('file:new', () => { updateStats(); updateFileName(); });
  eventBus.on('file:renamed', () => updateFileName());
  updateStats();

  // Focus mode toggle
  const focusModeLabel = el('span', { className: 'statusbar-stats statusbar-focus-label' });
  const focusBtn = el('button', {
    className: 'statusbar-icon-btn',
    'data-tooltip': 'Focus mode (Ctrl+Shift+F)',
    html: icons.focus,
    onClick: () => focusManager?.cycleMode(),
  });

  function updateFocusLabel() {
    if (focusManager?.isActive()) {
      focusModeLabel.textContent = focusManager.getCurrentModeLabel();
      focusModeLabel.style.display = '';
    } else {
      focusModeLabel.textContent = '';
      focusModeLabel.style.display = 'none';
    }
  }

  eventBus.on('settings:zenMode', updateFocusLabel);
  eventBus.on('settings:paragraphFocus', updateFocusLabel);
  eventBus.on('settings:typewriterMode', updateFocusLabel);
  updateFocusLabel();

  // Theme toggle
  const themeBtn = el('button', {
    className: 'statusbar-icon-btn',
    'data-tooltip': 'Toggle theme',
    html: settingsStore.getTheme() === 'dark' ? icons.sun : icons.moon,
    onClick: () => {
      const next = settingsStore.getTheme() === 'dark' ? 'light' : 'dark';
      settingsStore.set('theme', next);
    },
  });

  eventBus.on('settings:theme', (theme) => {
    themeBtn.innerHTML = theme === 'dark' ? icons.sun : icons.moon;
  });

  // Info button — modal instead of alert
  const infoBtn = el('button', {
    className: 'statusbar-icon-btn',
    'data-tooltip': 'About',
    html: icons.infoCircle,
    onClick: async () => {
      const { showInfo } = await import('./modal.js');
      const { words, lines } = getStats(documentStore.getMarkdown());
      const readTime = Math.max(1, Math.ceil(words / 200));
      showInfo(`${documentStore.getFileName()}`, `${words} words, ${lines} lines, ~${readTime} min read`);
    },
  });

  const statusEl = el('div', { className: 'statusbar' },
    el('div', { className: 'statusbar-left' }, fileNameEl, statsEl, historyBtn),
    el('div', { className: 'statusbar-right' }, focusModeLabel, focusBtn, themeBtn, infoBtn),
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
