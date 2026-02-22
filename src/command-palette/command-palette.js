import { el } from '../utils/dom.js';
import { commandRegistry } from './command-registry.js';
import { fuzzyMatch, highlightMatches } from './fuzzy-match.js';
import { extractHeadings, scrollToHeading } from './heading-utils.js';
import { documentStore } from '../store/document-store.js';
import { storage } from '../storage/local-storage.js';

const RECENT_KEY = 'mkdn-cmd-recent';
const MAX_RECENT = 10;
const MAX_RESULTS = 20;

let overlay = null;
let isOpen = false;
let selectedIndex = 0;
let currentResults = [];
let milkdownRef = null;

export function setMilkdownRef(m) {
  milkdownRef = m;
}

export function openCommandPalette(initialMode) {
  if (isOpen) return;
  // Don't open if a modal is already open
  if (document.querySelector('.modal-overlay.modal-open')) return;

  isOpen = true;
  selectedIndex = 0;

  ensureOverlay();
  overlay.replaceChildren();

  const input = el('input', {
    type: 'text',
    className: 'cmd-palette-input',
    placeholder: 'Type a command, > for actions, # for headings...',
  });

  if (initialMode === 'commands') input.value = '>';
  else if (initialMode === 'headings') input.value = '#';

  const resultsList = el('div', { className: 'cmd-palette-results' });

  const palette = el('div', { className: 'cmd-palette' },
    el('div', { className: 'cmd-palette-input-wrapper' }, input),
    resultsList,
  );

  overlay.appendChild(palette);
  overlay.classList.add('cmd-palette-open');

  // Event handlers
  input.addEventListener('input', () => {
    renderResults(input.value, resultsList);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, currentResults.length - 1);
      updateSelection(resultsList);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      updateSelection(resultsList);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      executeSelected();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeCommandPalette();
    }
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeCommandPalette();
  });

  // Initial render
  renderResults(input.value, resultsList);

  requestAnimationFrame(() => input.focus());
}

export function closeCommandPalette() {
  if (!isOpen) return false;
  isOpen = false;
  if (overlay) {
    overlay.classList.remove('cmd-palette-open');
    overlay.replaceChildren();
  }
  return true;
}

export function isCommandPaletteOpen() {
  return isOpen;
}

function ensureOverlay() {
  if (!overlay) {
    overlay = el('div', { className: 'cmd-palette-overlay' });
    document.body.appendChild(overlay);
  }
}

function detectMode(query) {
  if (query.startsWith('>')) return { mode: 'commands', q: query.slice(1).trim() };
  if (query.startsWith('#')) return { mode: 'headings', q: query.slice(1).trim() };
  return { mode: 'all', q: query.trim() };
}

function getRecentIds() {
  return storage.get(RECENT_KEY, []);
}

function addRecent(id) {
  const recent = getRecentIds().filter(r => r !== id);
  recent.unshift(id);
  storage.set(RECENT_KEY, recent.slice(0, MAX_RECENT));
}

function renderResults(query, container) {
  const { mode, q } = detectMode(query);
  container.replaceChildren();
  currentResults = [];
  selectedIndex = 0;

  if (mode === 'headings') {
    const headings = extractHeadings(documentStore.getMarkdown());
    let items = headings.map(h => ({
      id: `heading:${h.line}`,
      label: h.text,
      category: `H${h.level}`,
      level: h.level,
      type: 'heading',
    }));

    if (q) {
      items = items
        .map(item => ({ ...item, match: fuzzyMatch(q, item.label) }))
        .filter(item => item.match)
        .sort((a, b) => b.match.score - a.match.score);
    }

    currentResults = items.slice(0, MAX_RESULTS);
  } else {
    const allCommands = commandRegistry.getAll();
    let items;

    if (!q) {
      // Show recently used first, then all commands
      const recent = getRecentIds();
      const recentCmds = recent.map(id => commandRegistry.getById(id)).filter(Boolean);
      const rest = allCommands.filter(c => !recent.includes(c.id));
      items = [...recentCmds, ...rest].map(c => ({
        ...c,
        type: 'command',
        match: { score: 0, matches: [] },
      }));
    } else {
      items = allCommands
        .map(c => {
          // Match against label, category, keywords
          const targets = [c.label, c.category, ...(c.keywords || [])];
          let best = null;
          for (const t of targets) {
            const m = fuzzyMatch(q, t);
            if (m && (!best || m.score > best.score)) {
              best = m;
              // Keep the matches array relative to the label only
              if (t === c.label) best._labelMatches = m.matches;
            }
          }
          if (!best) return null;
          return {
            ...c,
            type: 'command',
            match: best,
            labelMatches: best._labelMatches || [],
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.match.score - a.match.score);
    }

    currentResults = items.slice(0, MAX_RESULTS);
  }

  // Render result items
  currentResults.forEach((item, i) => {
    const row = createResultRow(item, i);
    container.appendChild(row);
  });

  if (currentResults.length === 0) {
    container.appendChild(el('div', { className: 'cmd-palette-empty' }, 'No results'));
  }
}

function createResultRow(item, index) {
  const labelEl = el('span', { className: 'cmd-palette-label' });

  // Apply highlight if we have label matches
  const matches = item.labelMatches || (item.match?.matches) || [];
  const segments = highlightMatches(item.label, matches);
  for (const seg of segments) {
    if (seg.highlight) {
      labelEl.appendChild(el('mark', {}, seg.text));
    } else {
      labelEl.appendChild(document.createTextNode(seg.text));
    }
  }

  const parts = [
    el('span', { className: 'cmd-palette-category' }, item.category || ''),
    labelEl,
  ];

  if (item.shortcut) {
    parts.push(el('span', { className: 'cmd-palette-shortcut' }, item.shortcut));
  }

  const row = el('div', {
    className: `cmd-palette-row${index === selectedIndex ? ' selected' : ''}`,
    dataset: { index: String(index) },
  }, ...parts);

  row.addEventListener('click', () => {
    selectedIndex = index;
    executeSelected();
  });

  row.addEventListener('mouseenter', () => {
    selectedIndex = index;
    updateSelection(row.parentElement);
  });

  return row;
}

function updateSelection(container) {
  if (!container) return;
  const rows = container.querySelectorAll('.cmd-palette-row');
  rows.forEach((row, i) => {
    row.classList.toggle('selected', i === selectedIndex);
    if (i === selectedIndex) {
      row.scrollIntoView({ block: 'nearest' });
    }
  });
}

function executeSelected() {
  const item = currentResults[selectedIndex];
  if (!item) return;

  closeCommandPalette();

  if (item.type === 'heading' && milkdownRef) {
    scrollToHeading(milkdownRef, item.label, item.level);
  } else if (item.type === 'command') {
    addRecent(item.id);
    if (item.action) item.action();
  }
}

// Inject styles
const style = document.createElement('style');
style.textContent = `
.cmd-palette-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: var(--bg-overlay);
  z-index: 250;
  justify-content: center;
  align-items: flex-start;
  padding-top: 15vh;
}
.cmd-palette-overlay.cmd-palette-open {
  display: flex;
}
.cmd-palette {
  background: var(--bg-primary);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  width: 90vw;
  max-width: 560px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 60vh;
}
.cmd-palette-input-wrapper {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-light);
}
.cmd-palette-input {
  width: 100%;
  padding: 8px 12px;
  font-size: var(--font-size-base);
  font-family: var(--font-sans);
  border: none;
  background: transparent;
  color: var(--text-primary);
  outline: none;
}
.cmd-palette-input::placeholder {
  color: var(--text-muted);
}
.cmd-palette-results {
  overflow-y: auto;
  padding: 4px 0;
}
.cmd-palette-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  cursor: pointer;
  transition: background 0.1s ease;
}
.cmd-palette-row:hover,
.cmd-palette-row.selected {
  background: var(--bg-hover);
}
.cmd-palette-category {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  min-width: 52px;
  font-family: var(--font-sans);
}
.cmd-palette-label {
  flex: 1;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  font-family: var(--font-sans);
}
.cmd-palette-label mark {
  background: var(--accent-light);
  color: var(--accent);
  border-radius: 2px;
  padding: 0 1px;
}
.cmd-palette-shortcut {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  font-family: var(--font-mono);
  white-space: nowrap;
}
.cmd-palette-empty {
  padding: 20px 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: var(--font-size-sm);
  font-family: var(--font-sans);
}
`;
document.head.appendChild(style);
