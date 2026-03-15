import { el, injectStyles } from '../utils/dom.js';
import { fuzzyMatch, highlightMatches } from './fuzzy-match.js';
import { localSync } from '../local/local-sync.js';
import { eventBus } from '../store/event-bus.js';
import { icons } from '../toolbar/toolbar-icons.js';
import { storage } from '../storage/local-storage.js';
import { STORAGE_RECENT_FILES } from '../constants.js';

const MAX_RECENT = 10;
const MAX_RESULTS = 30;

let overlay = null;
let isOpen = false;
let selectedIndex = 0;
let currentResults = [];

// --- Recent files tracking ---

function getRecentFiles() {
  return storage.get(STORAGE_RECENT_FILES, []);
}

function addRecentFile(file) {
  const recent = getRecentFiles().filter(r => r.path !== file.path);
  recent.unshift({ path: file.path, name: file.name, openedAt: Date.now() });
  storage.set(STORAGE_RECENT_FILES, recent.slice(0, MAX_RECENT));
}

/** Call once at app init to track file:opened events. */
export function initRecentFileTracking() {
  eventBus.on('file:opened', ({ id, name }) => {
    if (id && name) {
      addRecentFile({ path: id, name });
    }
  });
}

// --- File switcher UI ---

export function openFileSwitcher() {
  if (isOpen) return;
  if (document.querySelector('.modal-overlay.modal-open')) return;

  isOpen = true;
  selectedIndex = 0;

  ensureOverlay();
  overlay.replaceChildren();

  const input = el('input', {
    type: 'text',
    className: 'file-switcher-input',
    placeholder: 'Search files...',
    role: 'combobox',
    'aria-expanded': 'true',
    'aria-controls': 'file-switcher-results',
    'aria-autocomplete': 'list',
  });

  const resultsList = el('div', {
    className: 'file-switcher-results',
    id: 'file-switcher-results',
    role: 'listbox',
  });

  const panel = el('div', { className: 'file-switcher' },
    el('div', { className: 'file-switcher-input-wrapper' }, input),
    resultsList,
  );

  overlay.appendChild(panel);
  overlay.classList.add('file-switcher-open');

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
      closeFileSwitcher();
    }
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeFileSwitcher();
  });

  renderResults('', resultsList);
  requestAnimationFrame(() => input.focus());
}

export function closeFileSwitcher() {
  if (!isOpen) return false;
  isOpen = false;
  if (overlay) {
    overlay.classList.remove('file-switcher-open');
    overlay.replaceChildren();
  }
  return true;
}

export function isFileSwitcherOpen() {
  return isOpen;
}

function ensureOverlay() {
  if (!overlay) {
    overlay = el('div', { className: 'file-switcher-overlay' });
    document.body.appendChild(overlay);
  }
}

// --- Results logic ---

function buildFileList() {
  const allFiles = localSync.getFiles();
  const recentPaths = getRecentFiles();

  // Build a map from path to file object for quick lookup
  const fileMap = new Map();
  for (const f of allFiles) {
    fileMap.set(f.path, f);
  }

  // Recent files first (only those still present in the folder)
  const recentSet = new Set();
  const recentItems = [];
  for (const r of recentPaths) {
    const f = fileMap.get(r.path);
    if (f) {
      recentSet.add(f.path);
      recentItems.push({ ...f, isRecent: true });
    }
  }

  // Remaining files (sorted by modification time, already sorted from localSync)
  const restItems = allFiles
    .filter(f => !recentSet.has(f.path))
    .map(f => ({ ...f, isRecent: false }));

  return [...recentItems, ...restItems];
}

function renderResults(query, container) {
  container.replaceChildren();
  currentResults = [];
  selectedIndex = 0;

  const q = query.trim();
  let items = buildFileList();

  if (q) {
    items = items
      .map(item => {
        // Match against both name and path
        const nameMatch = fuzzyMatch(q, item.name);
        const pathMatch = fuzzyMatch(q, item.path);
        const best = (!nameMatch && !pathMatch)
          ? null
          : (!pathMatch || (nameMatch && nameMatch.score >= pathMatch.score))
            ? nameMatch
            : pathMatch;
        if (!best) return null;
        return {
          ...item,
          match: best,
          nameMatches: nameMatch ? nameMatch.matches : [],
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.match.score - a.match.score);
  } else {
    items = items.map(item => ({ ...item, match: { score: 0, matches: [] }, nameMatches: [] }));
  }

  currentResults = items.slice(0, MAX_RESULTS);

  // Render a "Recent" header if the first result is recent and there's no query
  let showedRecentHeader = false;
  let showedAllHeader = false;

  currentResults.forEach((item, i) => {
    if (!q) {
      if (item.isRecent && !showedRecentHeader) {
        showedRecentHeader = true;
        container.appendChild(el('div', { className: 'file-switcher-section' }, 'Recent'));
      }
      if (!item.isRecent && !showedAllHeader) {
        showedAllHeader = true;
        container.appendChild(el('div', { className: 'file-switcher-section' }, 'All Files'));
      }
    }
    container.appendChild(createResultRow(item, i));
  });

  if (currentResults.length === 0) {
    const msg = localSync.isLinked()
      ? 'No matching files'
      : 'Link a folder to browse files';
    container.appendChild(el('div', { className: 'file-switcher-empty' }, msg));
  }
}

function createResultRow(item, index) {
  // File icon
  const iconEl = el('span', { className: 'file-switcher-icon', unsafeHTML: icons.file });

  // Filename with highlights
  const nameEl = el('span', { className: 'file-switcher-name' });
  const segments = highlightMatches(item.name, item.nameMatches || []);
  for (const seg of segments) {
    if (seg.highlight) {
      nameEl.appendChild(el('mark', {}, seg.text));
    } else {
      nameEl.appendChild(document.createTextNode(seg.text));
    }
  }

  // Relative path (directory portion)
  const dir = item.path.includes('/') ? item.path.slice(0, item.path.lastIndexOf('/')) : '';
  const pathEl = dir
    ? el('span', { className: 'file-switcher-path' }, dir)
    : null;

  // Relative time
  const timeEl = el('span', { className: 'file-switcher-time' }, relativeTime(item.modifiedTime));

  const leftParts = [iconEl, nameEl];
  if (pathEl) leftParts.push(pathEl);

  const left = el('span', { className: 'file-switcher-left' }, ...leftParts);
  const right = el('span', { className: 'file-switcher-right' }, timeEl);

  const row = el('div', {
    className: `file-switcher-row${index === selectedIndex ? ' selected' : ''}`,
    role: 'option',
    'aria-selected': String(index === selectedIndex),
    dataset: { index: String(index) },
  }, left, right);

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
  const rows = container.querySelectorAll('.file-switcher-row');
  rows.forEach((row, i) => {
    const isSelected = i === selectedIndex;
    row.classList.toggle('selected', isSelected);
    row.setAttribute('aria-selected', String(isSelected));
    if (isSelected) {
      row.scrollIntoView({ block: 'nearest' });
    }
  });
}

function executeSelected() {
  const item = currentResults[selectedIndex];
  if (!item) return;

  closeFileSwitcher();
  addRecentFile(item);
  localSync.open(item.path);
}

function relativeTime(timestamp) {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

// --- Styles ---

injectStyles(`
.file-switcher-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: var(--bg-overlay);
  z-index: 260;
  justify-content: center;
  align-items: flex-start;
  padding-top: 15vh;
}
.file-switcher-overlay.file-switcher-open {
  display: flex;
}
.file-switcher {
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
.file-switcher-input-wrapper {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-light);
}
.file-switcher-input {
  width: 100%;
  padding: 8px 12px;
  font-size: var(--font-size-base);
  font-family: var(--font-sans);
  border: none;
  background: transparent;
  color: var(--text-primary);
  outline: none;
}
.file-switcher-input::placeholder {
  color: var(--text-muted);
}
.file-switcher-results {
  overflow-y: auto;
  padding: 4px 0;
}
.file-switcher-section {
  padding: 6px 16px 2px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  font-family: var(--font-sans);
}
.file-switcher-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 16px;
  cursor: pointer;
  transition: background 0.1s ease;
}
.file-switcher-row:hover,
.file-switcher-row.selected {
  background: var(--bg-hover);
}
.file-switcher-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}
.file-switcher-icon {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
}
.file-switcher-icon svg {
  width: 16px;
  height: 16px;
}
.file-switcher-name {
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  font-family: var(--font-sans);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.file-switcher-name mark {
  background: var(--accent-light);
  color: var(--accent);
  border-radius: 2px;
  padding: 0 1px;
}
.file-switcher-path {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  font-family: var(--font-sans);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 1;
}
.file-switcher-right {
  flex-shrink: 0;
}
.file-switcher-time {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  font-family: var(--font-sans);
  white-space: nowrap;
}
.file-switcher-empty {
  padding: 20px 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: var(--font-size-sm);
  font-family: var(--font-sans);
}
`);
