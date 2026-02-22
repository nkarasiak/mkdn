import { el } from '../utils/dom.js';
import { milkdown } from '../editor/milkdown-setup.js';
import { documentStore } from '../store/document-store.js';
import { settingsStore } from '../store/settings-store.js';
import { eventBus } from '../store/event-bus.js';
import { extractHeadings } from '../command-palette/heading-utils.js';
import { getSourceTextarea } from '../editor/source-formatter.js';

let listEl = null;
let activeIndex = -1;
let headingsCache = [];
let updateTimer = null;
let scrollListener = null;

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function navigateToHeading(heading, index) {
  if (settingsStore.get('sourceMode')) {
    // Source mode: scroll textarea to heading line
    const ta = getSourceTextarea();
    if (!ta) return;
    const lines = ta.value.split('\n');
    let offset = 0;
    for (let i = 0; i < heading.line && i < lines.length; i++) {
      offset += lines[i].length + 1;
    }
    ta.setSelectionRange(offset, offset);
    ta.focus();
    // Scroll into view
    const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 20;
    ta.scrollTop = Math.max(0, heading.line * lineHeight - ta.clientHeight / 3);
  } else {
    // WYSIWYG mode: set cursor via ProseMirror position
    const pos = heading.pos ?? milkdown.findHeadingPos(heading.text, heading.level);
    if (pos != null) {
      milkdown.scrollToPos(pos);
    }
    // Reliable DOM-based scroll (ProseMirror scrollIntoView can silently fail)
    scrollToHeadingElement(heading.text, heading.level);
  }
  setActive(index);
}

function scrollToHeadingElement(text, level) {
  const editorPane = document.querySelector('.editor-pane');
  if (!editorPane) return;
  for (const h of editorPane.querySelectorAll(`h${level}`)) {
    if (h.textContent.trim() === text) {
      h.scrollIntoView({ block: 'start' });
      return;
    }
  }
}

function setActive(index) {
  if (!listEl) return;
  const items = listEl.querySelectorAll('.outline-item');
  items.forEach((item, i) => {
    item.classList.toggle('active', i === index);
  });
  activeIndex = index;
}

function renderOutline() {
  if (!listEl) return;
  listEl.replaceChildren();

  const inSourceMode = settingsStore.get('sourceMode');
  let headings;

  if (inSourceMode) {
    const markdown = documentStore.getMarkdown();
    headings = extractHeadings(markdown);
  } else {
    const positions = milkdown.getHeadingPositions();
    headings = positions.map(h => ({ ...h, line: -1 }));
    // Also get line numbers from markdown for source mode fallback
    const markdown = documentStore.getMarkdown();
    const mdHeadings = extractHeadings(markdown);
    headings = headings.map((h, i) => ({
      ...h,
      line: mdHeadings[i]?.line ?? -1,
    }));
  }

  headingsCache = headings;

  if (headings.length === 0) {
    listEl.appendChild(
      el('div', { className: 'sidebar-empty' }, 'No headings in document')
    );
    return;
  }

  headings.forEach((h, i) => {
    const item = el('div', {
      className: 'outline-item',
      style: { paddingLeft: `${(h.level - 1) * 14 + 12}px` },
      onClick: () => navigateToHeading(h, i),
    }, h.text || '(empty heading)');
    item.dataset.level = h.level;
    listEl.appendChild(item);
  });

  activeIndex = -1;
}

function setupScrollSpy() {
  // Clean up previous listener
  teardownScrollSpy();

  const updateActiveHeading = debounce(() => {
    if (settingsStore.get('sourceMode') || headingsCache.length === 0) return;

    const view = milkdown.getView();
    if (!view) return;

    try {
      // Find the topmost visible heading
      let activeIdx = -1;
      for (let i = 0; i < headingsCache.length; i++) {
        const h = headingsCache[i];
        if (h.pos == null) continue;
        const coords = view.coordsAtPos(h.pos);
        // Heading is visible if it's above the middle of the viewport
        if (coords.top <= view.dom.getBoundingClientRect().top + view.dom.clientHeight * 0.3) {
          activeIdx = i;
        }
      }
      if (activeIdx !== activeIndex) {
        setActive(activeIdx);
      }
    } catch { /* editor not ready */ }
  }, 100);

  // Listen for scroll on the editor pane
  const editorPane = document.querySelector('.editor-pane');
  if (editorPane) {
    scrollListener = updateActiveHeading;
    editorPane.addEventListener('scroll', scrollListener, { passive: true });
  }
}

function teardownScrollSpy() {
  if (scrollListener) {
    const editorPane = document.querySelector('.editor-pane');
    if (editorPane) {
      editorPane.removeEventListener('scroll', scrollListener);
    }
    scrollListener = null;
  }
}

const debouncedRender = debounce(() => {
  renderOutline();
}, 300);

export function createOutlinePanel() {
  listEl = el('div', { className: 'outline-list' });

  // Live updates on content changes
  eventBus.on('content:changed', debouncedRender);

  // Re-render on mode switch
  eventBus.on('settings:sourceMode', () => {
    renderOutline();
    if (!settingsStore.get('sourceMode')) {
      setupScrollSpy();
    } else {
      teardownScrollSpy();
    }
  });

  // Re-render on file open/new
  eventBus.on('file:opened', () => renderOutline());
  eventBus.on('file:new', () => renderOutline());

  // Initial render (delayed to let editor init)
  setTimeout(() => {
    renderOutline();
    setupScrollSpy();
  }, 500);

  return listEl;
}
