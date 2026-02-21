import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';

export const findReplacePluginKey = new PluginKey('find-replace');

/**
 * Shared state for find-replace highlights.
 * Updated externally by the engine, then a transaction triggers plugin re-decoration.
 */
export const findReplaceState = {
  ranges: [],       // [{ from, to }]
  currentIndex: -1, // which match is "current"
};

export function createFindReplacePlugin() {
  return new Plugin({
    key: findReplacePluginKey,
    state: {
      init() {
        return DecorationSet.empty;
      },
      apply(tr, oldSet, _oldState, newState) {
        if (tr.getMeta('find-replace-update')) {
          // Rebuild decorations from shared state
          const decorations = findReplaceState.ranges.map((range, i) => {
            const cls = i === findReplaceState.currentIndex
              ? 'find-match find-match-current'
              : 'find-match';
            return Decoration.inline(range.from, range.to, { class: cls });
          });
          return DecorationSet.create(newState.doc, decorations);
        }
        // Map decorations through document changes
        return oldSet.map(tr.mapping, tr.doc);
      },
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
}
