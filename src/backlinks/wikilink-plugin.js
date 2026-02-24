import { Plugin } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

/**
 * ProseMirror plugin that decorates [[wiki-links]] in the editor
 * with a styled inline widget.
 */
export function createWikilinkPlugin() {
  return new Plugin({
    props: {
      decorations(state) {
        const decorations = [];
        state.doc.descendants((node, pos) => {
          if (!node.isTextblock) return;
          const text = node.textContent;
          WIKILINK_RE.lastIndex = 0;
          let match;
          while ((match = WIKILINK_RE.exec(text)) !== null) {
            const start = pos + match.index + 1; // +1 for node opening
            const end = start + match[0].length;
            decorations.push(
              Decoration.inline(start, end, {
                class: 'wikilink',
                'data-target': match[1].split('|')[0].trim(),
              }),
            );
          }
        });
        return DecorationSet.create(state.doc, decorations);
      },
    },
  });
}

// Inject wikilink styles
const style = document.createElement('style');
style.textContent = `
  .wikilink {
    color: var(--accent);
    cursor: pointer;
    border-bottom: 1px dashed var(--accent);
    transition: opacity var(--transition-fast);
  }
  .wikilink:hover {
    opacity: 0.8;
  }
`;
document.head.appendChild(style);
