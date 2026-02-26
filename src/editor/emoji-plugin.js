import { Plugin, PluginKey } from '@milkdown/prose/state';
import { injectStyles } from '../utils/dom.js';
import { emojiData } from './emoji-data.js';

const emojiPluginKey = new PluginKey('emoji-picker');

/**
 * ProseMirror plugin that shows an emoji picker dropdown when the user types ':'
 * followed by search text. Filters emoji list, supports keyboard navigation.
 */
export function createEmojiPlugin() {
  let dropdown = null;
  let query = '';
  let triggerPos = -1;
  let selectedIndex = 0;
  let active = false;

  function createDropdown() {
    if (dropdown) return dropdown;
    dropdown = document.createElement('div');
    dropdown.className = 'emoji-picker-dropdown';
    document.body.appendChild(dropdown);
    return dropdown;
  }

  function hide() {
    if (dropdown) dropdown.style.display = 'none';
    active = false;
    query = '';
    triggerPos = -1;
    selectedIndex = 0;
  }

  function filterEmojis(q) {
    if (!q) return emojiData.slice(0, 8);
    const lower = q.toLowerCase();
    return emojiData.filter(e =>
      e.n.includes(lower) || e.k.includes(lower)
    ).slice(0, 8);
  }

  function render(results, view) {
    const dd = createDropdown();
    dd.replaceChildren();

    if (results.length === 0) {
      dd.style.display = 'none';
      return;
    }

    results.forEach((emoji, i) => {
      const item = document.createElement('div');
      item.className = `emoji-picker-item${i === selectedIndex ? ' selected' : ''}`;
      item.innerHTML = `<span class="emoji-picker-char">${emoji.e}</span><span class="emoji-picker-name">:${emoji.n}:</span>`;
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        insertEmoji(view, emoji.e);
      });
      item.addEventListener('mouseenter', () => {
        selectedIndex = i;
        updateSelection(dd);
      });
      dd.appendChild(item);
    });

    // Position near cursor
    const coords = view.coordsAtPos(view.state.selection.from);
    dd.style.display = 'block';
    dd.style.left = `${coords.left}px`;
    dd.style.top = `${coords.bottom + 4}px`;

    // Keep dropdown on screen
    requestAnimationFrame(() => {
      const rect = dd.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        dd.style.left = `${window.innerWidth - rect.width - 8}px`;
      }
      if (rect.bottom > window.innerHeight) {
        dd.style.top = `${coords.top - rect.height - 4}px`;
      }
    });
  }

  function updateSelection(dd) {
    const items = dd.querySelectorAll('.emoji-picker-item');
    items.forEach((item, i) => {
      item.classList.toggle('selected', i === selectedIndex);
    });
  }

  function insertEmoji(view, emoji) {
    const { state, dispatch } = view;
    // Replace from trigger ':' to current position
    const from = triggerPos;
    const to = state.selection.from;
    dispatch(state.tr.replaceWith(from, to, state.schema.text(emoji)).scrollIntoView());
    hide();
    view.focus();
  }

  return new Plugin({
    key: emojiPluginKey,
    props: {
      handleKeyDown(view, event) {
        if (!active) {
          // Check for ':' trigger
          if (event.key === ':') {
            const { $from } = view.state.selection;
            // Don't trigger inside code blocks
            for (let d = $from.depth; d > 0; d--) {
              const name = $from.node(d).type.name;
              if (name === 'code_block') return false;
            }
            // Don't trigger if the current inline marks include `code`
            if ($from.marks().some(m => m.type.name === 'code_inline' || m.type.name === 'inlineCode')) {
              return false;
            }
            // Activate after the ':' is inserted
            setTimeout(() => {
              triggerPos = view.state.selection.from - 1;
              active = true;
              query = '';
              selectedIndex = 0;
              render(filterEmojis(''), view);
            }, 0);
            return false;
          }
          return false;
        }

        // Active — handle navigation keys
        if (event.key === 'Escape') {
          hide();
          return true;
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          const results = filterEmojis(query);
          selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
          updateSelection(createDropdown());
          return true;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          selectedIndex = Math.max(selectedIndex - 1, 0);
          updateSelection(createDropdown());
          return true;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          event.preventDefault();
          const results = filterEmojis(query);
          if (results[selectedIndex]) {
            insertEmoji(view, results[selectedIndex].e);
          }
          return true;
        }
        if (event.key === ' ') {
          hide();
          return false;
        }
        return false;
      },

      handleTextInput(view, from, to, text) {
        if (!active) return false;

        // Update query after text is inserted
        setTimeout(() => {
          const { state } = view;
          const textSinceTrigger = state.doc.textBetween(triggerPos + 1, state.selection.from);
          query = textSinceTrigger;
          selectedIndex = 0;

          // If query is too long or contains space, cancel
          if (query.length > 20 || query.includes(' ')) {
            hide();
            return;
          }

          render(filterEmojis(query), view);
        }, 0);

        return false;
      },
    },

    view() {
      return {
        destroy() {
          if (dropdown) {
            dropdown.remove();
            dropdown = null;
          }
        },
      };
    },
  });
}

// Inject styles
injectStyles(`
  .emoji-picker-dropdown {
    display: none;
    position: fixed;
    z-index: 500;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    padding: 4px;
    min-width: 200px;
    max-width: 300px;
  }

  .emoji-picker-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: var(--font-sans);
    font-size: var(--font-size-sm);
    transition: background 0.1s ease;
  }

  .emoji-picker-item:hover,
  .emoji-picker-item.selected {
    background: var(--bg-hover);
  }

  .emoji-picker-char {
    font-size: 18px;
    width: 24px;
    text-align: center;
    flex-shrink: 0;
    line-height: 1;
  }

  .emoji-picker-name {
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`);
