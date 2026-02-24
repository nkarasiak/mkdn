import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';

const mermaidPluginKey = new PluginKey('mermaid');

let mermaidLib = null;
let mermaidLoading = false;
const mermaidLoadCallbacks = [];

async function loadMermaid() {
  if (mermaidLib) return mermaidLib;
  if (mermaidLoading) {
    return new Promise((resolve) => mermaidLoadCallbacks.push(resolve));
  }
  mermaidLoading = true;
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs');
    mermaidLib = mod.default;
    mermaidLib.initialize({
      startOnLoad: false,
      theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'default',
      securityLevel: 'strict',
    });
    mermaidLoadCallbacks.forEach(cb => cb(mermaidLib));
    mermaidLoadCallbacks.length = 0;
    return mermaidLib;
  } catch (err) {
    console.warn('Failed to load Mermaid:', err);
    mermaidLoading = false;
    return null;
  }
}

// Cache of rendered diagrams: code → svg
const renderCache = new Map();

async function renderMermaidDiagram(code, id) {
  if (renderCache.has(code)) return renderCache.get(code);

  const mermaid = await loadMermaid();
  if (!mermaid) return null;

  try {
    const { svg } = await mermaid.render(id, code);
    renderCache.set(code, svg);
    return svg;
  } catch {
    return null;
  }
}

/**
 * ProseMirror plugin that renders Mermaid code blocks as diagrams.
 * Detects code blocks with language "mermaid" and adds a rendered preview below.
 */
export function createMermaidPlugin() {
  return new Plugin({
    key: mermaidPluginKey,
    state: {
      init() { return DecorationSet.empty; },
      apply(tr, set, oldState, newState) {
        // Only recalculate when doc changes
        if (!tr.docChanged && !tr.getMeta('mermaid-refresh')) return set;
        return buildDecorations(newState);
      },
    },
    props: {
      decorations(state) {
        return mermaidPluginKey.getState(state);
      },
    },
    view(editorView) {
      // Initial render
      renderAllMermaidBlocks(editorView);
      return {
        update(view, prevState) {
          if (view.state.doc !== prevState.doc) {
            renderAllMermaidBlocks(view);
          }
        },
      };
    },
  });
}

function buildDecorations(state) {
  const decorations = [];
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'code_block' && node.attrs.language === 'mermaid') {
      decorations.push(
        Decoration.node(pos, pos + node.nodeSize, {
          class: 'mermaid-code-block',
        }),
      );
    }
  });
  return DecorationSet.create(state.doc, decorations);
}

function renderAllMermaidBlocks(view) {
  const { doc } = view.state;
  doc.descendants((node, pos) => {
    if (node.type.name === 'code_block' && node.attrs.language === 'mermaid') {
      const code = node.textContent;
      const domNode = view.nodeDOM(pos);
      if (!domNode) return;

      // Check if preview already exists
      let preview = domNode.parentElement?.querySelector('.mermaid-preview');
      if (!preview) {
        preview = document.createElement('div');
        preview.className = 'mermaid-preview';
        preview.textContent = 'Loading diagram...';
        domNode.parentElement?.appendChild(preview);
      }

      const id = `mermaid-${pos}-${Date.now()}`;
      renderMermaidDiagram(code, id).then(svg => {
        if (svg) {
          // Parse SVG safely via DOMParser instead of innerHTML
          const parser = new DOMParser();
          const doc = parser.parseFromString(svg, 'image/svg+xml');
          const svgEl = doc.documentElement;
          if (svgEl && svgEl.tagName === 'svg') {
            preview.replaceChildren(document.importNode(svgEl, true));
          } else {
            preview.textContent = 'Invalid diagram output';
          }
          preview.classList.remove('mermaid-error');
        } else {
          preview.textContent = 'Invalid Mermaid diagram';
          preview.classList.add('mermaid-error');
        }
      });
    }
  });
}

// Inject styles
const style = document.createElement('style');
style.textContent = `
  .mermaid-code-block {
    position: relative;
  }
  .mermaid-preview {
    margin: -8px 0 20px;
    padding: 16px;
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
    border: 1px solid var(--border-light);
    text-align: center;
    overflow-x: auto;
  }
  .mermaid-preview svg {
    max-width: 100%;
    height: auto;
  }
  .mermaid-preview.mermaid-error {
    color: var(--error);
    font-size: var(--font-size-sm);
    font-style: italic;
  }
`;
document.head.appendChild(style);
