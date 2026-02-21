import { el } from '../utils/dom.js';
import { icons } from '../toolbar/toolbar-icons.js';
import { documentStore } from '../store/document-store.js';
import { eventBus } from '../store/event-bus.js';
import { settingsStore } from '../store/settings-store.js';
import { localSync } from '../local/local-sync.js';

export function createStatusBar({ onToggleHistory, focusManager } = {}) {
  // Left side: editable file name + stats
  const fileNameEl = el('span', {
    className: 'statusbar-stats statusbar-filename',
    'data-tooltip': 'Click to rename',
  }, documentStore.getFileName());

  const fileNameInput = el('input', {
    type: 'text',
    className: 'statusbar-filename-input',
  });

  let editing = false;

  function startEditing() {
    if (editing) return;
    editing = true;
    fileNameInput.value = documentStore.getFileName();
    fileNameEl.style.display = 'none';
    fileNameEl.parentNode.insertBefore(fileNameInput, fileNameEl);
    fileNameInput.focus();
    // Select the name part without extension
    const dot = fileNameInput.value.lastIndexOf('.');
    fileNameInput.setSelectionRange(0, dot > 0 ? dot : fileNameInput.value.length);
  }

  function commitRename() {
    if (!editing) return;
    editing = false;
    const newName = fileNameInput.value.trim();
    fileNameInput.remove();
    fileNameEl.style.display = '';

    if (newName && newName !== documentStore.getFileName()) {
      const oldId = documentStore.getFileId();
      const source = documentStore.getFileSource();

      if (source === 'local' && oldId) {
        // Rename on disk via localSync
        localSync.renameFile(oldId, newName);
      } else {
        // Browser-only: just update the name in store
        documentStore.setFileName(newName);
      }
    }
  }

  function cancelRename() {
    if (!editing) return;
    editing = false;
    fileNameInput.remove();
    fileNameEl.style.display = '';
  }

  fileNameEl.addEventListener('click', startEditing);

  fileNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
    e.stopPropagation(); // prevent keyboard shortcuts while editing
  });

  fileNameInput.addEventListener('blur', commitRename);

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

  // Info / About button
  const infoBtn = el('button', {
    className: 'statusbar-icon-btn',
    'data-tooltip': 'About',
    html: icons.infoCircle,
    onClick: async () => {
      const { showInfo } = await import('./modal.js');
      showInfo('About mkdn', buildAboutContent());
    },
  });

  const statusEl = el('div', { className: 'statusbar' },
    el('div', { className: 'statusbar-left' }, fileNameEl, statsEl),
    el('div', { className: 'statusbar-right' }, focusModeLabel, focusBtn, historyBtn, themeBtn, infoBtn),
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
    el('p', { className: 'about-version' }, `v1.0.0`),
  );
}

function getStats(md) {
  if (!md) return { words: 0, lines: 0 };
  const text = md.trim();
  const words = text ? text.split(/\s+/).length : 0;
  const lines = text ? text.split('\n').length : 0;
  return { words, lines };
}
