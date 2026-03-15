import { Plugin, PluginKey } from '@milkdown/prose/state';
import { el, injectStyles } from '../utils/dom.js';
import { milkdown } from './milkdown-setup.js';
import { settingsStore } from '../store/settings-store.js';

const floatingToolbarKey = new PluginKey('floating-toolbar');

// Inject floating toolbar styles
injectStyles(`
  .floating-toolbar {
    position: absolute;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px 6px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    z-index: 200;
    opacity: 0;
    visibility: hidden;
    transform: translateX(-50%) translateY(4px);
    transition: opacity 0.15s ease, transform 0.15s ease, visibility 0.15s ease;
    pointer-events: none;
    white-space: nowrap;
  }

  .floating-toolbar.visible {
    opacity: 1;
    visibility: visible;
    transform: translateX(-50%) translateY(0);
    pointer-events: auto;
  }

  .floating-toolbar-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-family: var(--font-sans);
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.1s ease, color 0.1s ease;
    border: none;
    background: none;
    padding: 0;
    line-height: 1;
  }

  .floating-toolbar-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .floating-toolbar-btn.active {
    background: var(--accent-light);
    color: var(--accent);
  }

  .floating-toolbar-btn svg {
    width: 15px;
    height: 15px;
  }

  .floating-toolbar-divider {
    width: 1px;
    height: 18px;
    background: var(--border-color);
    margin: 0 4px;
    opacity: 0.5;
  }

  .floating-toolbar-heading-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    padding: 4px;
    min-width: 120px;
    display: none;
    z-index: 210;
  }

  .floating-toolbar-heading-menu.open {
    display: block;
  }

  .floating-toolbar-heading-item {
    display: block;
    width: 100%;
    padding: 6px 12px;
    font-family: var(--font-sans);
    font-size: 13px;
    color: var(--text-primary);
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    text-align: left;
    cursor: pointer;
    transition: background 0.1s ease;
  }

  .floating-toolbar-heading-item:hover {
    background: var(--bg-hover);
  }

  .floating-toolbar-heading-item.active {
    color: var(--accent);
    font-weight: 600;
  }
`);

let toolbarEl = null;
let headingMenu = null;
let hideTimeout = null;

function getToolbarEl() {
  if (toolbarEl) return toolbarEl;

  headingMenu = el('div', { className: 'floating-toolbar-heading-menu' },
    ...['Normal', 'Heading 1', 'Heading 2', 'Heading 3'].map((label, i) =>
      el('button', {
        className: 'floating-toolbar-heading-item',
        onMousedown: (e) => {
          e.preventDefault();
          e.stopPropagation();
          milkdown.runCommand(milkdown.commands.wrapHeading, i);
          headingMenu.classList.remove('open');
        },
      }, label)
    ),
  );

  const mkBtn = (html, tooltip, onMousedown) => {
    const b = el('button', { className: 'floating-toolbar-btn', 'aria-label': tooltip });
    b.innerHTML = html;
    b.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onMousedown();
    });
    return b;
  };

  const divider = () => el('div', { className: 'floating-toolbar-divider' });

  const headingBtn = mkBtn(
    '<span style="font-size:12px;letter-spacing:-0.02em">H</span>',
    'Heading',
    () => {
      headingMenu.classList.toggle('open');
    },
  );
  headingBtn.style.position = 'relative';
  headingBtn.appendChild(headingMenu);

  const boldBtn = mkBtn('<b>B</b>', 'Bold', () => milkdown.runCommand(milkdown.commands.toggleBold));
  const italicBtn = mkBtn('<i>I</i>', 'Italic', () => milkdown.runCommand(milkdown.commands.toggleItalic));
  const strikeBtn = mkBtn('<s>S</s>', 'Strikethrough', () => milkdown.runCommand(milkdown.commands.toggleStrikethrough));
  const codeBtn = mkBtn(
    '<span style="font-size:11px;font-family:var(--font-mono)">&lt;/&gt;</span>',
    'Code',
    () => milkdown.runCommand(milkdown.commands.toggleCode),
  );
  const linkBtn = mkBtn(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
    'Link',
    () => import('../ui/link-popover.js').then(m => m.openLinkPopover()),
  );
  const quoteBtn = mkBtn(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 5v3z"/></svg>',
    'Quote',
    () => milkdown.toggleBlockquote(),
  );
  const commentBtn = mkBtn(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    'Comment',
    () => import('../comments/comment-plugin.js').then(m => m.addComment()),
  );

  toolbarEl = el('div', { className: 'floating-toolbar' },
    headingBtn,
    divider(),
    boldBtn,
    italicBtn,
    strikeBtn,
    codeBtn,
    divider(),
    linkBtn,
    quoteBtn,
    commentBtn,
  );

  // Store refs for active state updates
  toolbarEl._buttons = { boldBtn, italicBtn, strikeBtn, codeBtn, headingBtn, quoteBtn };

  // Prevent toolbar from stealing focus
  toolbarEl.addEventListener('mousedown', (e) => {
    e.preventDefault();
  });

  document.body.appendChild(toolbarEl);
  return toolbarEl;
}

function updateActiveState(state) {
  const tb = toolbarEl;
  if (!tb?._buttons) return;

  const { $from } = state.selection;
  const marks = state.storedMarks || $from.marks();

  const hasBold = marks.some(m => m.type.name === 'strong');
  const hasItalic = marks.some(m => m.type.name === 'emphasis');
  const hasStrike = marks.some(m => m.type.name === 'strikethrough');
  const hasCode = marks.some(m => m.type.name === 'inlineCode');

  tb._buttons.boldBtn.classList.toggle('active', hasBold);
  tb._buttons.italicBtn.classList.toggle('active', hasItalic);
  tb._buttons.strikeBtn.classList.toggle('active', hasStrike);
  tb._buttons.codeBtn.classList.toggle('active', hasCode);

  // Heading state
  const parent = $from.parent;
  const isHeading = parent.type.name === 'heading';
  tb._buttons.headingBtn.classList.toggle('active', isHeading);

  // Update heading menu active items
  if (headingMenu) {
    const items = headingMenu.querySelectorAll('.floating-toolbar-heading-item');
    items.forEach((item, i) => {
      const active = isHeading ? parent.attrs.level === i : i === 0 && !isHeading;
      item.classList.toggle('active', active);
    });
  }

  // Blockquote state
  let isBlockquote = false;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'blockquote') { isBlockquote = true; break; }
  }
  tb._buttons.quoteBtn.classList.toggle('active', isBlockquote);
}

function positionToolbar(view) {
  const { from, to } = view.state.selection;
  if (from === to) return;

  const tb = getToolbarEl();
  const start = view.coordsAtPos(from);
  const end = view.coordsAtPos(to);

  // Position above the selection, centered
  const left = (start.left + end.left) / 2;
  const top = Math.min(start.top, end.top);

  tb.style.left = `${left}px`;
  tb.style.top = `${top - tb.offsetHeight - 8}px`;

  // Clamp within viewport
  requestAnimationFrame(() => {
    const rect = tb.getBoundingClientRect();
    if (rect.left < 8) {
      tb.style.left = `${left + (8 - rect.left)}px`;
    }
    if (rect.right > window.innerWidth - 8) {
      tb.style.left = `${left - (rect.right - window.innerWidth + 8)}px`;
    }
    if (rect.top < 8) {
      // Show below selection instead
      const bottom = Math.max(start.bottom, end.bottom);
      tb.style.top = `${bottom + 8}px`;
    }
  });
}

function showToolbar(view) {
  if (settingsStore.get('sourceMode')) return;
  clearTimeout(hideTimeout);

  const tb = getToolbarEl();
  positionToolbar(view);
  updateActiveState(view.state);

  // Close heading menu when showing
  headingMenu?.classList.remove('open');

  requestAnimationFrame(() => {
    tb.classList.add('visible');
  });
}

function hideToolbar() {
  clearTimeout(hideTimeout);
  hideTimeout = setTimeout(() => {
    if (toolbarEl) {
      toolbarEl.classList.remove('visible');
      headingMenu?.classList.remove('open');
    }
  }, 100);
}

export function createFloatingToolbarPlugin() {
  return new Plugin({
    key: floatingToolbarKey,
    view() {
      return {
        update(view) {
          const { from, to, empty } = view.state.selection;

          // Only show on non-empty text selections
          if (empty || from === to) {
            hideToolbar();
            return;
          }

          // Don't show in code blocks
          const $from = view.state.selection.$from;
          if ($from.parent.type.name === 'code_block' || $from.parent.type.spec.code) {
            hideToolbar();
            return;
          }

          // Don't show if selection is within a node that doesn't support marks
          showToolbar(view);
        },
        destroy() {
          hideToolbar();
        },
      };
    },
  });
}
