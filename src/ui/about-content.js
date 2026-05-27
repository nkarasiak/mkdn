import { el } from '../utils/dom.js';

function shortcutRow(keys, desc) {
  return el('tr', {},
    el('td', { className: 'about-shortcut-keys' },
      ...keys.map(k => el('kbd', {}, k)),
    ),
    el('td', {}, desc),
  );
}

export function buildAboutContent() {
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
      shortcutRow(['Ctrl', 'W'], 'Close tab'),
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
    el('p', { className: 'about-version' }, `v${__APP_VERSION__}`),
  );
}
