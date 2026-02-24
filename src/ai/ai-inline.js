import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import { aiProvider } from './ai-provider.js';
import { settingsStore } from '../store/settings-store.js';

const aiInlineKey = new PluginKey('ai-inline');
let ghostText = '';
let ghostPos = -1;
let debounceTimer = null;
let abortController = null;

function clearGhost(view) {
  ghostText = '';
  ghostPos = -1;
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  const tr = view.state.tr.setMeta(aiInlineKey, { clear: true });
  view.dispatch(tr);
}

async function requestCompletion(view, pos, textBefore) {
  if (abortController) abortController.abort();
  abortController = new AbortController();

  try {
    const result = await aiProvider.prompt(
      'You are an inline text autocomplete engine for a markdown editor. Given the text before the cursor, suggest a natural continuation. Return ONLY the continuation text (a few words to one sentence). Do not repeat what came before. Do not add quotes or explanations.',
      `Complete this text naturally:\n\n${textBefore.slice(-500)}`,
      { signal: abortController.signal }
    );

    if (result && typeof result === 'string') {
      ghostText = result.trim();
      ghostPos = pos;
      const tr = view.state.tr.setMeta(aiInlineKey, { ghost: ghostText, pos });
      view.dispatch(tr);
    }
  } catch (e) {
    if (e.name !== 'AbortError') {
      // Silently fail - autocomplete is non-essential
    }
  }
}

export function createAiInlinePlugin() {
  return new Plugin({
    key: aiInlineKey,

    state: {
      init() { return DecorationSet.empty; },
      apply(tr, set) {
        const meta = tr.getMeta(aiInlineKey);
        if (meta?.clear) return DecorationSet.empty;
        if (meta?.ghost && meta?.pos) {
          const widget = Decoration.widget(meta.pos, () => {
            const span = document.createElement('span');
            span.className = 'ai-ghost-text';
            span.textContent = meta.ghost;
            return span;
          }, { side: 1 });
          return DecorationSet.create(tr.doc, [widget]);
        }
        if (tr.docChanged) return DecorationSet.empty;
        return set.map(tr.mapping, tr.doc);
      },
    },

    props: {
      decorations(state) {
        return this.getState(state);
      },

      handleKeyDown(view, event) {
        // Tab to accept ghost text
        if (event.key === 'Tab' && ghostText && ghostPos >= 0) {
          event.preventDefault();
          const { state, dispatch } = view;
          const tr = state.tr.insertText(ghostText, ghostPos);
          tr.setMeta(aiInlineKey, { clear: true });
          dispatch(tr);
          ghostText = '';
          ghostPos = -1;
          return true;
        }

        // Escape to dismiss
        if (event.key === 'Escape' && ghostText) {
          clearGhost(view);
          return true;
        }

        return false;
      },
    },

    view() {
      return {
        update(view, prevState) {
          if (!settingsStore.get('aiInlineComplete')) return;
          if (!aiProvider.isAvailable()) return;

          const { state } = view;
          const { from, to } = state.selection;

          // Only trigger on cursor moves / text changes with empty selection
          if (from !== to) {
            if (ghostText) clearGhost(view);
            return;
          }

          // Don't trigger inside code blocks
          const $pos = state.doc.resolve(from);
          for (let d = $pos.depth; d > 0; d--) {
            if ($pos.node(d).type.name === 'code_block') return;
          }

          // Get text before cursor
          const textBefore = state.doc.textBetween(0, from, '\n', '\n');
          if (textBefore.length < 10) return; // Need some context

          // Debounce: wait 1.5s after last keystroke
          clearTimeout(debounceTimer);
          if (ghostText) clearGhost(view);

          debounceTimer = setTimeout(() => {
            requestCompletion(view, from, textBefore);
          }, 1500);
        },

        destroy() {
          clearTimeout(debounceTimer);
          if (abortController) abortController.abort();
        },
      };
    },
  });
}

export { aiInlineKey };
