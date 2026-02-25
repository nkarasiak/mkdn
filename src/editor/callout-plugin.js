import { Plugin, PluginKey } from '@milkdown/prose/state';
import { injectStyles } from '../utils/dom.js';
import { Decoration, DecorationSet } from '@milkdown/prose/view';

const calloutPluginKey = new PluginKey('callout');

const CALLOUT_RE = /^\[!(NOTE|TIP|WARNING|CAUTION|IMPORTANT)\]\s*/i;

const CALLOUT_CONFIG = {
  note: { label: 'Note', icon: '\u2139\uFE0F' },
  tip: { label: 'Tip', icon: '\u{1F4A1}' },
  warning: { label: 'Warning', icon: '\u26A0\uFE0F' },
  caution: { label: 'Caution', icon: '\u{1F6D1}' },
  important: { label: 'Important', icon: '\u2757' },
};

/**
 * ProseMirror plugin that detects GitHub-style callout syntax in blockquotes
 * (e.g. > [!NOTE]) and applies CSS class decorations for visual styling.
 */
export function createCalloutPlugin() {
  return new Plugin({
    key: calloutPluginKey,
    state: {
      init(_, state) { return buildDecorations(state); },
      apply(tr, set, oldState, newState) {
        if (!tr.docChanged) return set;
        return buildDecorations(newState);
      },
    },
    props: {
      decorations(state) {
        return calloutPluginKey.getState(state);
      },
    },
  });
}

function buildDecorations(state) {
  const decorations = [];

  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'blockquote') return;

    // Check if the first child paragraph starts with [!TYPE]
    const firstChild = node.firstChild;
    if (!firstChild || firstChild.type.name !== 'paragraph') return;

    const text = firstChild.textContent;
    const match = text.match(CALLOUT_RE);
    if (!match) return;

    const type = match[1].toLowerCase();

    // Apply class decoration to the blockquote
    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, {
        class: `callout callout-${type}`,
        'data-callout-type': type,
      }),
    );
  });

  return DecorationSet.create(state.doc, decorations);
}

// Inject callout styles
injectStyles(`
  .callout {
    border-left: 4px solid var(--callout-color, var(--accent));
    background: var(--callout-bg, var(--bg-secondary));
    border-radius: var(--radius-md);
    padding: 2px 0;
    margin: 8px 0;
    position: relative;
  }

  .callout > p:first-child::before {
    font-weight: 600;
    margin-right: 6px;
  }

  /* Note — blue */
  .callout-note {
    --callout-color: #4493f8;
    --callout-bg: rgba(68, 147, 248, 0.08);
  }
  .callout-note > p:first-child::before {
    content: '\\2139\\FE0F Note';
    color: #4493f8;
  }

  /* Tip — green */
  .callout-tip {
    --callout-color: #3fb950;
    --callout-bg: rgba(63, 185, 80, 0.08);
  }
  .callout-tip > p:first-child::before {
    content: '\\1F4A1 Tip';
    color: #3fb950;
  }

  /* Warning — amber */
  .callout-warning {
    --callout-color: #d29922;
    --callout-bg: rgba(210, 153, 34, 0.08);
  }
  .callout-warning > p:first-child::before {
    content: '\\26A0\\FE0F Warning';
    color: #d29922;
  }

  /* Caution — red */
  .callout-caution {
    --callout-color: #f85149;
    --callout-bg: rgba(248, 81, 73, 0.08);
  }
  .callout-caution > p:first-child::before {
    content: '\\1F6D1 Caution';
    color: #f85149;
  }

  /* Important — purple */
  .callout-important {
    --callout-color: #a371f7;
    --callout-bg: rgba(163, 113, 247, 0.08);
  }
  .callout-important > p:first-child::before {
    content: '\\2757 Important';
    color: #a371f7;
  }

  /* Dark mode adjustments */
  [data-theme="dark"] .callout-note { --callout-bg: rgba(68, 147, 248, 0.1); }
  [data-theme="dark"] .callout-tip { --callout-bg: rgba(63, 185, 80, 0.1); }
  [data-theme="dark"] .callout-warning { --callout-bg: rgba(210, 153, 34, 0.1); }
  [data-theme="dark"] .callout-caution { --callout-bg: rgba(248, 81, 73, 0.1); }
  [data-theme="dark"] .callout-important { --callout-bg: rgba(163, 113, 247, 0.1); }
`);
