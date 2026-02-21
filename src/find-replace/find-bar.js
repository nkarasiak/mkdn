import { el } from '../utils/dom.js';
import { settingsStore } from '../store/settings-store.js';
import { eventBus } from '../store/event-bus.js';
import { createProseMirrorEngine, createTextareaEngine } from './find-replace-engine.js';

let barEl = null;
let isOpen = false;
let showReplace = false;

let searchInput = null;
let replaceInput = null;
let counterEl = null;
let replaceRow = null;
let caseSensitiveBtn = null;

let pmEngine = null;
let taEngine = null;
let currentEngine = null;
let caseSensitive = false;
let searchTimer = null;

// Inject styles once
let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .find-bar {
      position: absolute;
      top: 8px;
      right: 16px;
      z-index: 50;
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-md);
      padding: 8px 10px;
      display: none;
      flex-direction: column;
      gap: 6px;
      min-width: 320px;
      font-family: var(--font-sans);
    }

    .find-bar.open {
      display: flex;
    }

    .find-bar-row {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .find-bar-input {
      flex: 1;
      font-size: var(--font-size-sm);
      padding: 5px 8px;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm);
      background: var(--bg-secondary);
      color: var(--text-primary);
      font-family: var(--font-sans);
      outline: none;
      min-width: 0;
    }

    .find-bar-input:focus {
      border-color: var(--accent);
    }

    .find-bar-counter {
      font-size: var(--font-size-xs);
      color: var(--text-muted);
      white-space: nowrap;
      min-width: 52px;
      text-align: center;
    }

    .find-bar-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      border-radius: var(--radius-sm);
      color: var(--text-secondary);
      background: transparent;
      border: none;
      cursor: pointer;
      flex-shrink: 0;
      font-size: 14px;
      line-height: 1;
    }

    .find-bar-btn:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .find-bar-btn.active {
      background: var(--accent-light);
      color: var(--accent);
    }

    .find-bar-btn svg {
      width: 14px;
      height: 14px;
    }

    .find-bar-text-btn {
      font-size: var(--font-size-xs);
      padding: 4px 8px;
      border-radius: var(--radius-sm);
      color: var(--text-secondary);
      background: transparent;
      border: none;
      cursor: pointer;
      white-space: nowrap;
      font-family: var(--font-sans);
    }

    .find-bar-text-btn:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .find-bar-replace-row {
      display: none;
    }

    .find-bar-replace-row.visible {
      display: flex;
    }

    /* Match highlight decorations (ProseMirror) */
    .find-match {
      background: rgba(255, 213, 79, 0.4);
      border-radius: 2px;
    }

    .find-match-current {
      background: rgba(255, 152, 0, 0.5);
      outline: 2px solid var(--accent);
      border-radius: 2px;
    }

    [data-theme="dark"] .find-match {
      background: rgba(255, 213, 79, 0.25);
    }

    [data-theme="dark"] .find-match-current {
      background: rgba(255, 152, 0, 0.35);
    }
  `;
  document.head.appendChild(style);
}

function getEngine() {
  return settingsStore.get('sourceMode') ? taEngine : pmEngine;
}

function updateCounter() {
  if (!counterEl || !currentEngine) return;
  const total = currentEngine.getTotal();
  const idx = currentEngine.getCurrentIndex();
  if (total === 0) {
    counterEl.textContent = searchInput?.value ? 'No results' : '';
  } else {
    counterEl.textContent = `${idx + 1} of ${total}`;
  }
}

function runSearch() {
  currentEngine = getEngine();
  if (!currentEngine) return;
  const query = searchInput?.value || '';
  currentEngine.findAll(query, caseSensitive);
  updateCounter();
}

function debouncedSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 150);
}

function buildBar(container) {
  injectStyles();

  // Arrows
  const prevIcon = '\u2191'; // up arrow
  const nextIcon = '\u2193'; // down arrow

  counterEl = el('span', { className: 'find-bar-counter' });
  searchInput = el('input', {
    className: 'find-bar-input',
    type: 'text',
    placeholder: 'Find...',
    onInput: debouncedSearch,
    onKeydown: (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          currentEngine?.goToPrev();
        } else {
          currentEngine?.goToNext();
        }
        updateCounter();
      }
      if (e.key === 'Escape') {
        closeFindBar();
      }
    },
  });

  const prevBtn = el('button', {
    className: 'find-bar-btn',
    'data-tooltip': 'Previous (Shift+Enter)',
    onClick: () => { currentEngine?.goToPrev(); updateCounter(); },
  }, prevIcon);

  const nextBtn = el('button', {
    className: 'find-bar-btn',
    'data-tooltip': 'Next (Enter)',
    onClick: () => { currentEngine?.goToNext(); updateCounter(); },
  }, nextIcon);

  caseSensitiveBtn = el('button', {
    className: 'find-bar-btn',
    'data-tooltip': 'Case sensitive',
    onClick: () => {
      caseSensitive = !caseSensitive;
      caseSensitiveBtn.classList.toggle('active', caseSensitive);
      runSearch();
    },
  }, 'Aa');

  const closeBtn = el('button', {
    className: 'find-bar-btn',
    'data-tooltip': 'Close (Escape)',
    onClick: closeFindBar,
  }, '\u00d7'); // × symbol

  const searchRow = el('div', { className: 'find-bar-row' },
    searchInput, counterEl, prevBtn, nextBtn, caseSensitiveBtn, closeBtn,
  );

  // Replace row
  replaceInput = el('input', {
    className: 'find-bar-input',
    type: 'text',
    placeholder: 'Replace...',
    onKeydown: (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        currentEngine?.replace(replaceInput.value);
        updateCounter();
      }
      if (e.key === 'Escape') {
        closeFindBar();
      }
    },
  });

  const replaceBtn = el('button', {
    className: 'find-bar-text-btn',
    onClick: () => { currentEngine?.replace(replaceInput.value); updateCounter(); },
  }, 'Replace');

  const replaceAllBtn = el('button', {
    className: 'find-bar-text-btn',
    onClick: () => { currentEngine?.replaceAll(replaceInput.value); updateCounter(); },
  }, 'All');

  replaceRow = el('div', { className: 'find-bar-row find-bar-replace-row' },
    replaceInput, replaceBtn, replaceAllBtn,
  );

  barEl = el('div', { className: 'find-bar' }, searchRow, replaceRow);
  container.appendChild(barEl);
}

export function openFindBar(withReplace = false) {
  if (!barEl) return;
  showReplace = withReplace;
  isOpen = true;
  barEl.classList.add('open');
  replaceRow.classList.toggle('visible', showReplace);
  searchInput.focus();
  searchInput.select();
  // If there's already a query, re-run search
  if (searchInput.value) {
    runSearch();
  }
}

export function closeFindBar() {
  if (!barEl || !isOpen) return false;
  isOpen = false;
  barEl.classList.remove('open');
  // Clear highlights
  currentEngine?.clearHighlights();
  counterEl.textContent = '';
  return true;
}

export function isFindBarOpen() {
  return isOpen;
}

export function initFindBar({ editorContainer, milkdown }) {
  // Create engines
  pmEngine = createProseMirrorEngine(() => milkdown.getView());
  taEngine = createTextareaEngine(() => {
    return document.querySelector('.source-editor');
  });

  currentEngine = pmEngine;
  buildBar(editorContainer);

  // Switch engines on mode change
  eventBus.on('settings:sourceMode', () => {
    if (!isOpen) return;
    // Clear old engine highlights
    currentEngine?.clearHighlights();
    currentEngine = getEngine();
    // Re-run search with current query
    if (searchInput?.value) {
      runSearch();
    }
  });
}
