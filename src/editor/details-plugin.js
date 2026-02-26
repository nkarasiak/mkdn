import { injectStyles } from '../utils/dom.js';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';

const detailsPluginKey = new PluginKey('details');

const DETAILS_OPEN_RE = /^<details>\s*$/im;
const DETAILS_CLOSE_RE = /^<\/details>\s*$/im;
const SUMMARY_RE = /<summary>(.*?)<\/summary>/i;

/**
 * ProseMirror plugin that renders <details>/<summary> HTML blocks
 * as interactive collapsible toggle elements.
 *
 * Works with markdown like:
 * ```
 * <details>
 * <summary>Click to expand</summary>
 *
 * Content here
 *
 * </details>
 * ```
 *
 * Since Milkdown parses these as `html` nodes, we use widget decorations
 * to render them with interactive behavior.
 */
export function createDetailsPlugin() {
  return new Plugin({
    key: detailsPluginKey,
    state: {
      init(_, state) { return buildDecorations(state); },
      apply(tr, set, oldState, newState) {
        if (!tr.docChanged) return set;
        return buildDecorations(newState);
      },
    },
    props: {
      decorations(state) {
        return detailsPluginKey.getState(state);
      },
    },
    view(editorView) {
      renderDetailsBlocks(editorView);
      return {
        update(view, prevState) {
          if (view.state.doc !== prevState.doc) {
            renderDetailsBlocks(view);
          }
        },
      };
    },
  });
}

function buildDecorations(state) {
  const decorations = [];
  // Look for consecutive html nodes forming a <details> block
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'html' && DETAILS_OPEN_RE.test(node.textContent)) {
      decorations.push(
        Decoration.node(pos, pos + node.nodeSize, {
          class: 'details-block-start',
        }),
      );
    }
  });
  return DecorationSet.create(state.doc, decorations);
}

/**
 * After the doc is rendered, find HTML nodes containing <details> and
 * replace their DOM representations with interactive toggle elements.
 */
function renderDetailsBlocks(view) {
  const { doc } = view.state;

  // Collect groups of nodes forming <details>...</details>
  const htmlNodes = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'html') {
      htmlNodes.push({ node, pos, text: node.textContent });
    }
  });

  // Process each html node to find <details> content
  for (const { node, pos, text } of htmlNodes) {
    // Check for complete <details> block in a single html node
    if (text.includes('<details>') && text.includes('</details>')) {
      const domNode = view.nodeDOM(pos);
      if (!domNode) continue;

      // Check if already enhanced
      if (domNode.parentElement?.querySelector('.details-rendered')) continue;

      const summaryMatch = text.match(SUMMARY_RE);
      const summaryText = summaryMatch ? summaryMatch[1] : 'Details';

      // Extract body content between </summary> and </details>
      let bodyContent = '';
      const summaryEnd = text.indexOf('</summary>');
      const detailsEnd = text.indexOf('</details>');
      if (summaryEnd !== -1 && detailsEnd !== -1) {
        bodyContent = text.substring(summaryEnd + '</summary>'.length, detailsEnd).trim();
      }

      // Create the interactive details element
      const wrapper = document.createElement('div');
      wrapper.className = 'details-rendered';
      wrapper.contentEditable = 'false';

      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = summaryText;
      details.appendChild(summary);

      const body = document.createElement('div');
      body.className = 'details-body';
      body.textContent = bodyContent;
      details.appendChild(body);

      wrapper.appendChild(details);

      // Insert after the raw HTML node
      domNode.parentElement?.insertBefore(wrapper, domNode.nextSibling);
    }
  }
}

// Inject styles
injectStyles(`
  .details-block-start {
    display: none;
  }

  .details-rendered {
    margin: 8px 0;
    user-select: none;
  }

  .details-rendered details {
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .details-rendered summary {
    padding: 10px 14px;
    font-family: var(--font-sans);
    font-size: var(--font-size-base);
    font-weight: 600;
    cursor: pointer;
    background: var(--bg-secondary);
    color: var(--text-primary);
    list-style: none;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: background var(--transition-fast);
  }

  .details-rendered summary:hover {
    background: var(--bg-hover);
  }

  .details-rendered summary::before {
    content: '';
    width: 0;
    height: 0;
    border-left: 6px solid var(--text-muted);
    border-top: 4px solid transparent;
    border-bottom: 4px solid transparent;
    flex-shrink: 0;
    transition: transform 0.2s ease;
  }

  .details-rendered summary::-webkit-details-marker {
    display: none;
  }

  .details-rendered details[open] > summary::before {
    transform: rotate(90deg);
  }

  .details-rendered .details-body {
    padding: 12px 14px;
    font-size: var(--font-size-base);
    color: var(--text-primary);
    border-top: 1px solid var(--border-light);
    line-height: 1.6;
  }
`);
