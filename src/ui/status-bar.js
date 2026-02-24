import { el, svgIcon } from '../utils/dom.js';
import { icons } from '../toolbar/toolbar-icons.js';
import { documentStore } from '../store/document-store.js';
import { eventBus } from '../store/event-bus.js';
import { settingsStore } from '../store/settings-store.js';
import { createPeerIndicator } from '../collab/collab-ui.js';

export function createStatusBar({ onToggleHistory, focusManager } = {}) {
  const statsEl = el('span', {
    className: 'statusbar-stats statusbar-stats-clickable',
    onClick: () => import('../stats/writing-stats.js').then(m => m.openWritingStats()),
    'data-tooltip': 'Writing statistics',
  }, '0 words');

  const historyBtn = el('button', {
    className: 'statusbar-icon-btn',
    'data-tooltip': 'History (Ctrl+Shift+H)',
    unsafeHTML: icons.clock,
    onClick: () => onToggleHistory?.(),
  });

  function updateStats() {
    const { words } = getStats(documentStore.getMarkdown());
    const readTime = Math.max(1, Math.ceil(words / 200));
    statsEl.textContent = `${words} word${words !== 1 ? 's' : ''}  ·  ${readTime} min read`;
  }

  eventBus.on('content:changed', updateStats);
  eventBus.on('file:opened', updateStats);
  eventBus.on('file:new', updateStats);
  updateStats();

  // Focus mode toggle
  const focusModeLabel = el('span', { className: 'statusbar-stats statusbar-focus-label' });
  const focusBtn = el('button', {
    className: 'statusbar-icon-btn',
    'data-tooltip': 'Focus mode (Ctrl+Shift+F)',
    unsafeHTML: icons.focus,
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
    unsafeHTML: settingsStore.getTheme() === 'dark' ? icons.sun : icons.moon,
    onClick: () => {
      const next = settingsStore.getTheme() === 'dark' ? 'light' : 'dark';
      settingsStore.set('theme', next);
    },
  });

  eventBus.on('settings:theme', (theme) => {
    themeBtn.replaceChildren(svgIcon(theme === 'dark' ? icons.sun : icons.moon));
  });

  // Info / About button
  const infoBtn = el('button', {
    className: 'statusbar-icon-btn',
    'data-tooltip': 'About',
    unsafeHTML: icons.infoCircle,
    onClick: async () => {
      const { showInfo } = await import('./modal.js');
      showInfo('About mkdn', buildAboutContent());
    },
  });

  const statusEl = el('div', { className: 'statusbar' },
    el('div', { className: 'statusbar-left' }, statsEl),
    el('div', { className: 'statusbar-right' }, createPeerIndicator(), focusModeLabel, focusBtn, historyBtn, themeBtn, infoBtn),
  );

  return statusEl;
}

function shortcutRow(keys, desc) {
  return el('tr', {},
    el('td', { className: 'about-shortcut-keys' },
      ...keys.map(k => el('kbd', {}, k)),
    ),
    el('td', {}, desc),
  );
}

function buildAboutContent() {
  const shortcuts = el('table', { className: 'about-shortcuts' },
    el('tbody', {},
      shortcutRow(['Ctrl', 'S'], 'Save'),
      shortcutRow(['Ctrl', 'Shift', 'S'], 'Save as'),
      shortcutRow(['Ctrl', 'N'], 'New document'),
      shortcutRow(['Ctrl', 'O'], 'Open file'),
      shortcutRow(['Ctrl', 'K'], 'Command palette'),
      shortcutRow(['Ctrl', 'L'], 'Insert link'),
      shortcutRow(['Ctrl', 'B'], 'Bold'),
      shortcutRow(['Ctrl', 'I'], 'Italic'),
      shortcutRow(['Ctrl', 'E'], 'Inline code'),
      shortcutRow(['Ctrl', 'F'], 'Find'),
      shortcutRow(['Ctrl', 'H'], 'Find & Replace'),
      shortcutRow(['Ctrl', 'P'], 'Print / PDF'),
      shortcutRow(['Ctrl', 'Shift', 'B'], 'Toggle sidebar'),
      shortcutRow(['Ctrl', 'Shift', 'H'], 'Toggle history'),
      shortcutRow(['Ctrl', 'U'], 'Toggle source view'),
      shortcutRow(['Ctrl', 'Shift', 'F'], 'Cycle focus modes'),
      shortcutRow(['Esc'], 'Close dialog / exit focus'),
    ),
  );

  const issueLink = el('a', {
    href: 'https://github.com/nkarasiak/mkdn/issues',
    target: '_blank',
    rel: 'noopener',
    className: 'about-link',
  }, 'github.com/nkarasiak/mkdn/issues');

  return el('div', { className: 'about-content' },
    el('p', { className: 'about-description' }, 'A minimal, browser-based markdown editor.'),
    el('h4', { className: 'about-section-title' }, 'Keyboard shortcuts'),
    shortcuts,
    el('h4', { className: 'about-section-title' }, 'Report an issue'),
    el('p', {}, issueLink),
    el('h4', { className: 'about-section-title' }, 'Credits'),
    el('p', {}, 'Created by Nicolas Karasiak & Claude'),
    el('p', { className: 'about-version' }, `v2.0.0`),
  );
}

function getStats(md) {
  if (!md) return { words: 0, lines: 0 };
  const text = md.trim();
  const words = text ? text.split(/\s+/).length : 0;
  const lines = text ? text.split('\n').length : 0;
  return { words, lines };
}
