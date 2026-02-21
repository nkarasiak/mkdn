import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import { settingsStore } from '../store/settings-store.js';

export const paragraphFocusKey = new PluginKey('paragraph-focus');

export function createParagraphFocusPlugin() {
  return new Plugin({
    key: paragraphFocusKey,
    state: {
      init(_, state) {
        return buildDecorations(state);
      },
      apply(tr, old, _oldState, newState) {
        if (!settingsStore.get('paragraphFocus')) return DecorationSet.empty;
        if (tr.selectionSet || tr.docChanged || tr.getMeta('focus-mode-toggle')) {
          return buildDecorations(newState);
        }
        return old;
      },
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
}

function buildDecorations(state) {
  if (!settingsStore.get('paragraphFocus')) return DecorationSet.empty;

  const { from } = state.selection;
  const decorations = [];
  let activeNodePos = null;

  // Find which top-level node contains the selection
  state.doc.forEach((node, pos) => {
    const end = pos + node.nodeSize;
    if (from >= pos && from <= end) {
      activeNodePos = pos;
    }
  });

  // Apply decorations to top-level nodes
  state.doc.forEach((node, pos) => {
    const cls = pos === activeNodePos ? 'pm-focus-active' : 'pm-focus-dimmed';
    decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: cls }));
  });

  return DecorationSet.create(state.doc, decorations);
}
