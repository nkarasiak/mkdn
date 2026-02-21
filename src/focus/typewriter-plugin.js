import { Plugin, PluginKey } from '@milkdown/prose/state';
import { settingsStore } from '../store/settings-store.js';

export const typewriterKey = new PluginKey('typewriter');

export function createTypewriterPlugin() {
  let lastY = null;
  const DEAD_ZONE = 50;

  return new Plugin({
    key: typewriterKey,
    view() {
      return {
        update(view) {
          if (!settingsStore.get('typewriterMode')) {
            lastY = null;
            return;
          }

          const { from } = view.state.selection;
          const coords = view.coordsAtPos(from);
          const editorPane = view.dom.closest('.editor-pane');
          if (!editorPane) return;

          const paneRect = editorPane.getBoundingClientRect();
          const targetY = paneRect.top + paneRect.height / 2;
          const cursorY = coords.top;
          const delta = cursorY - targetY;

          // Dead zone: skip micro-scrolls
          if (lastY !== null && Math.abs(cursorY - lastY) < DEAD_ZONE && Math.abs(delta) < DEAD_ZONE) {
            return;
          }

          lastY = cursorY;

          if (Math.abs(delta) > DEAD_ZONE) {
            requestAnimationFrame(() => {
              editorPane.scrollBy({ top: delta, behavior: 'smooth' });
            });
          }
        },
      };
    },
  });
}
