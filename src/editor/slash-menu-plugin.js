import { Plugin, PluginKey } from '@milkdown/prose/state';
import { el, injectStyles } from '../utils/dom.js';
import { settingsStore } from '../store/settings-store.js';
import { milkdown } from './milkdown-setup.js';

const slashMenuKey = new PluginKey('slash-menu');

// Inject styles
injectStyles(`
  .slash-menu {
    position: absolute;
    min-width: 240px;
    max-width: 300px;
    max-height: 320px;
    overflow-y: auto;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    z-index: 300;
    padding: 6px;
    opacity: 0;
    visibility: hidden;
    transform: translateY(-4px);
    transition: opacity 0.12s ease, transform 0.12s ease, visibility 0.12s ease;
    scrollbar-width: thin;
  }

  .slash-menu.visible {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
  }

  .slash-menu-group-label {
    padding: 6px 10px 4px;
    font-family: var(--font-sans);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    user-select: none;
  }

  .slash-menu-group-label:not(:first-child) {
    margin-top: 4px;
    border-top: 1px solid var(--border-light);
    padding-top: 8px;
  }

  .slash-menu-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 7px 10px;
    font-family: var(--font-sans);
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    border: none;
    background: none;
    border-radius: var(--radius-sm);
    text-align: left;
    cursor: pointer;
    transition: background 0.08s ease;
  }

  .slash-menu-item:hover,
  .slash-menu-item.selected {
    background: var(--bg-hover);
  }

  .slash-menu-item-icon {
    width: 20px;
    text-align: center;
    font-size: 14px;
    flex-shrink: 0;
    line-height: 1;
  }

  .slash-menu-item-content {
    flex: 1;
    min-width: 0;
  }

  .slash-menu-item-label {
    font-weight: 500;
  }

  .slash-menu-item-desc {
    font-size: 11px;
    color: var(--text-muted);
    margin-top: 1px;
  }

  .slash-menu-empty {
    padding: 12px 10px;
    font-family: var(--font-sans);
    font-size: var(--font-size-sm);
    color: var(--text-muted);
    text-align: center;
  }
`);

const SLASH_ITEMS = [
  // Text
  { id: 'h1', icon: 'H1', label: 'Heading 1', desc: 'Large heading', group: 'Text', keywords: ['heading', 'title', 'h1'] },
  { id: 'h2', icon: 'H2', label: 'Heading 2', desc: 'Medium heading', group: 'Text', keywords: ['heading', 'subtitle', 'h2'] },
  { id: 'h3', icon: 'H3', label: 'Heading 3', desc: 'Small heading', group: 'Text', keywords: ['heading', 'h3'] },
  { id: 'quote', icon: '\u201C', label: 'Quote', desc: 'Block quote', group: 'Text', keywords: ['blockquote', 'quote', 'citation'] },
  { id: 'callout-note', icon: '\u2139\uFE0F', label: 'Note Callout', desc: 'Informational callout', group: 'Text', keywords: ['callout', 'note', 'info', 'admonition'] },
  { id: 'callout-tip', icon: '\u{1F4A1}', label: 'Tip Callout', desc: 'Helpful tip', group: 'Text', keywords: ['callout', 'tip', 'hint'] },
  { id: 'callout-warning', icon: '\u26A0\uFE0F', label: 'Warning Callout', desc: 'Warning message', group: 'Text', keywords: ['callout', 'warning', 'caution'] },

  // Lists
  { id: 'bullet', icon: '\u2022', label: 'Bullet List', desc: 'Unordered list', group: 'Lists', keywords: ['bullet', 'list', 'unordered', 'ul'] },
  { id: 'ordered', icon: '1.', label: 'Numbered List', desc: 'Ordered list', group: 'Lists', keywords: ['numbered', 'list', 'ordered', 'ol'] },
  { id: 'todo', icon: '\u2611', label: 'To-do List', desc: 'Checklist with checkboxes', group: 'Lists', keywords: ['todo', 'task', 'checklist', 'checkbox'] },

  // Media
  { id: 'image', icon: '\u{1F5BC}\uFE0F', label: 'Image', desc: 'Upload or embed image', group: 'Media', keywords: ['image', 'picture', 'photo', 'img'] },
  { id: 'embed', icon: '\u{1F3AC}', label: 'Video Embed', desc: 'YouTube, Vimeo, etc.', group: 'Media', keywords: ['video', 'embed', 'youtube', 'vimeo'] },
  { id: 'mermaid', icon: '\u{1F4CA}', label: 'Mermaid Diagram', desc: 'Flowchart, sequence, etc.', group: 'Media', keywords: ['mermaid', 'diagram', 'flowchart', 'chart'] },

  // Advanced
  { id: 'table', icon: '\u{1F4CB}', label: 'Table', desc: '3\u00D73 table', group: 'Advanced', keywords: ['table', 'grid', 'spreadsheet'] },
  { id: 'code', icon: '\u2328\uFE0F', label: 'Code Block', desc: 'Fenced code block', group: 'Advanced', keywords: ['code', 'codeblock', 'snippet', 'pre'] },
  { id: 'hr', icon: '\u2500', label: 'Divider', desc: 'Horizontal rule', group: 'Advanced', keywords: ['divider', 'hr', 'line', 'separator', 'horizontal'] },
  { id: 'details', icon: '\u25B6', label: 'Toggle Block', desc: 'Collapsible section', group: 'Advanced', keywords: ['toggle', 'details', 'collapsible', 'accordion', 'expand'] },
  { id: 'date', icon: '\u{1F4C5}', label: "Today's Date", desc: 'Insert current date', group: 'Advanced', keywords: ['date', 'today', 'time'] },
  { id: 'template', icon: '\u{1F4C4}', label: 'From Template', desc: 'Insert from template', group: 'Advanced', keywords: ['template', 'snippet'] },
];

function executeItem(id, view) {
  if (!view) return;
  const { state, dispatch } = view;

  switch (id) {
    case 'h1': milkdown.runCommand(milkdown.commands.wrapHeading, 1); break;
    case 'h2': milkdown.runCommand(milkdown.commands.wrapHeading, 2); break;
    case 'h3': milkdown.runCommand(milkdown.commands.wrapHeading, 3); break;
    case 'quote': milkdown.toggleBlockquote(); break;
    case 'callout-note':
    case 'callout-tip':
    case 'callout-warning': {
      const type = id.replace('callout-', '').toUpperCase();
      milkdown.toggleBlockquote();
      requestAnimationFrame(() => {
        const v = milkdown.getView();
        if (v) {
          const { state: s, dispatch: d } = v;
          const { from } = s.selection;
          d(s.tr.insertText(`[!${type}]\n`, from, from).scrollIntoView());
        }
      });
      break;
    }
    case 'bullet':
      milkdown.runCommand(milkdown.commands.wrapHeading, 0);
      milkdown.runCommand(milkdown.commands.wrapBulletList);
      break;
    case 'ordered':
      milkdown.runCommand(milkdown.commands.wrapHeading, 0);
      milkdown.runCommand(milkdown.commands.wrapOrderedList);
      break;
    case 'todo': {
      const text = '- [ ] ';
      dispatch(state.tr.insertText(text).scrollIntoView());
      break;
    }
    case 'image': {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.addEventListener('change', () => {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          milkdown.runCommand(milkdown.commands.insertImage, { src: reader.result, alt: file.name });
        };
        reader.readAsDataURL(file);
      });
      input.click();
      break;
    }
    case 'embed': {
      const url = prompt('Enter video URL (YouTube, Vimeo, etc.):');
      if (url?.trim()) milkdown.insertEmbedUrl(url.trim());
      break;
    }
    case 'mermaid': {
      const text = '```mermaid\ngraph TD\n    A[Start] --> B[End]\n```\n';
      dispatch(state.tr.insertText(text).scrollIntoView());
      break;
    }
    case 'table': milkdown.insertTable(3, 3); break;
    case 'code':
      milkdown.runCommand(milkdown.commands.wrapHeading, 0);
      milkdown.runCommand(milkdown.commands.createCodeBlock);
      break;
    case 'hr': milkdown.runCommand(milkdown.commands.insertHr); break;
    case 'details': {
      const text = '<details>\n<summary>Click to expand</summary>\n\nContent here\n\n</details>';
      dispatch(state.tr.insertText(text).scrollIntoView());
      break;
    }
    case 'date': {
      const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      dispatch(state.tr.insertText(date).scrollIntoView());
      break;
    }
    case 'template':
      import('../templates/template-system.js').then(m => m.openTemplateChooser());
      break;
  }
}

let menuEl = null;
let selectedIndex = 0;
let filteredItems = [];
let active = false;
let slashPos = null;

function getMenuEl() {
  if (menuEl) return menuEl;
  menuEl = el('div', { className: 'slash-menu' });
  document.body.appendChild(menuEl);
  return menuEl;
}

function filterItems(query) {
  const q = query.toLowerCase().trim();
  if (!q) return SLASH_ITEMS;
  return SLASH_ITEMS.filter(item =>
    item.label.toLowerCase().includes(q) ||
    item.desc.toLowerCase().includes(q) ||
    item.keywords.some(k => k.includes(q))
  );
}

function renderMenu(items) {
  const menu = getMenuEl();
  menu.replaceChildren();
  filteredItems = items;

  if (items.length === 0) {
    menu.appendChild(el('div', { className: 'slash-menu-empty' }, 'No matching commands'));
    return;
  }

  let currentGroup = '';
  items.forEach((item, i) => {
    if (item.group !== currentGroup) {
      currentGroup = item.group;
      menu.appendChild(el('div', { className: 'slash-menu-group-label' }, currentGroup));
    }

    const itemEl = el('button', {
      className: `slash-menu-item ${i === selectedIndex ? 'selected' : ''}`,
      onMouseenter: () => {
        selectedIndex = i;
        updateSelection();
      },
      onMousedown: (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectItem(i);
      },
    },
      el('span', { className: 'slash-menu-item-icon' }, item.icon),
      el('div', { className: 'slash-menu-item-content' },
        el('div', { className: 'slash-menu-item-label' }, item.label),
        el('div', { className: 'slash-menu-item-desc' }, item.desc),
      ),
    );
    menu.appendChild(itemEl);
  });
}

function updateSelection() {
  const menu = getMenuEl();
  const items = menu.querySelectorAll('.slash-menu-item');
  items.forEach((el, i) => {
    el.classList.toggle('selected', i === selectedIndex);
  });
  // Scroll into view
  items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
}

function selectItem(index) {
  const item = filteredItems[index];
  if (!item) return;

  const view = milkdown.getView();
  if (!view) { hideMenu(); return; }

  // Delete the slash and query text
  const { state, dispatch } = view;
  if (slashPos != null) {
    const { from } = state.selection;
    dispatch(state.tr.delete(slashPos, from));
  }

  hideMenu();

  // Execute the command after the deletion is processed
  requestAnimationFrame(() => {
    const v = milkdown.getView();
    if (v) executeItem(item.id, v);
  });
}

function showMenu(view, pos) {
  if (settingsStore.get('sourceMode')) return;

  active = true;
  slashPos = pos;
  selectedIndex = 0;

  const menu = getMenuEl();
  renderMenu(SLASH_ITEMS);

  // Position below cursor
  const coords = view.coordsAtPos(pos);
  menu.style.left = `${coords.left}px`;
  menu.style.top = `${coords.bottom + 6}px`;

  requestAnimationFrame(() => {
    menu.classList.add('visible');

    // Clamp within viewport
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth - 8) {
      menu.style.left = `${window.innerWidth - rect.width - 8}px`;
    }
    if (rect.bottom > window.innerHeight - 8) {
      menu.style.top = `${coords.top - rect.height - 6}px`;
    }
  });
}

function hideMenu() {
  active = false;
  slashPos = null;
  if (menuEl) {
    menuEl.classList.remove('visible');
  }
}

function getQuery(state) {
  if (slashPos == null) return null;
  const { from } = state.selection;
  if (from < slashPos) return null;
  return state.doc.textBetween(slashPos, from, '');
}

export function createSlashMenuPlugin() {
  return new Plugin({
    key: slashMenuKey,

    props: {
      handleKeyDown(view, event) {
        if (!active) return false;

        if (event.key === 'ArrowDown') {
          event.preventDefault();
          selectedIndex = Math.min(selectedIndex + 1, filteredItems.length - 1);
          updateSelection();
          return true;
        }

        if (event.key === 'ArrowUp') {
          event.preventDefault();
          selectedIndex = Math.max(selectedIndex - 1, 0);
          updateSelection();
          return true;
        }

        if (event.key === 'Enter' || event.key === 'Tab') {
          event.preventDefault();
          selectItem(selectedIndex);
          return true;
        }

        if (event.key === 'Escape') {
          event.preventDefault();
          hideMenu();
          return true;
        }

        return false;
      },
    },

    view() {
      return {
        update(view) {
          const { state } = view;
          const { selection, doc } = state;
          const { from, empty } = selection;

          if (!empty) {
            if (active) hideMenu();
            return;
          }

          // Check if we're in a text context (not code block)
          const $from = selection.$from;
          if ($from.parent.type.name === 'code_block' || $from.parent.type.spec.code) {
            if (active) hideMenu();
            return;
          }

          if (active) {
            // Update filter based on typed query
            const query = getQuery(state);
            if (query == null || query.includes(' ') || query.length > 20) {
              hideMenu();
              return;
            }
            // Remove leading slash for filtering
            const filterQ = query.startsWith('/') ? query.slice(1) : query;
            const items = filterItems(filterQ);
            selectedIndex = Math.min(selectedIndex, Math.max(0, items.length - 1));
            renderMenu(items);
            return;
          }

          // Check for slash trigger: "/" at line start or after whitespace
          if (from < 1) return;

          const textBefore = doc.textBetween(Math.max(0, from - 1), from, '');
          if (textBefore !== '/') return;

          // Check that slash is at start of block or after whitespace
          const blockStart = $from.start();
          const textInBlock = doc.textBetween(blockStart, from, '');
          // Only trigger if "/" is the only character in the block, or preceded by whitespace
          const beforeSlash = textInBlock.slice(0, -1);
          if (beforeSlash.length > 0 && !/\s$/.test(beforeSlash)) return;

          showMenu(view, from - 1);
        },

        destroy() {
          hideMenu();
        },
      };
    },
  });
}
