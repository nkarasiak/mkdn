import { Crepe } from '@milkdown/crepe';
import { editorViewCtx, commandsCtx } from '@milkdown/core';
import { replaceAll, callCommand } from '@milkdown/utils';
import {
  toggleStrongCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  wrapInHeadingCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInBlockquoteCommand,
  liftListItemCommand,
  turnIntoTextCommand,
  insertHrCommand,
  createCodeBlockCommand,
  insertImageCommand,
} from '@milkdown/preset-commonmark';
import { undoCommand, redoCommand } from '@milkdown/plugin-history';
import { toggleLinkCommand } from '@milkdown/components/link-tooltip';
import { toggleStrikethroughCommand } from '@milkdown/preset-gfm';
import { documentStore } from '../store/document-store.js';
import { eventBus } from '../store/event-bus.js';

// Crepe CSS themes
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';

let crepe = null;
let updating = false;

export const milkdown = {
  async init(container) {
    const content = documentStore.getMarkdown();

    crepe = new Crepe({
      root: container,
      defaultValue: content,
    });

    // Listen for content changes from Milkdown
    crepe.on((api) => {
      api.markdownUpdated((_ctx, markdown, _prevMarkdown) => {
        if (updating) return;
        if (markdown !== documentStore.getMarkdown()) {
          documentStore.setMarkdown(markdown, 'milkdown');
        }
      });
    });

    await crepe.create();

    // Override toggleLinkCommand so all link triggers (floating toolbar,
    // keyboard shortcut) open our custom popover instead of Milkdown's default.
    const cmds = crepe.editor.ctx.get(commandsCtx);
    cmds.create(toggleLinkCommand.key, () => () => {
      import('../ui/link-popover.js').then(m => m.openLinkPopover());
      return true;
    });

    // Listen for external content changes (file-open, new-document)
    eventBus.on('content:changed', ({ content, source }) => {
      if (source === 'milkdown') return;
      if (!crepe) return;
      this.setContent(content);
    });
  },

  setContent(markdown) {
    if (!crepe) return;
    try {
      updating = true;
      crepe.editor.action(replaceAll(markdown));
    } catch { /* editor may not be ready */ }
    finally {
      updating = false;
    }
  },

  runCommand(cmd, payload) {
    if (!crepe) return;
    try {
      const view = crepe.editor.ctx.get(editorViewCtx);
      if (!view.hasFocus()) view.focus();
      crepe.editor.action(callCommand(cmd, payload));
    } catch { /* ignore */ }
  },

  /** Return the currently selected text in the editor, or '' if no selection. */
  getSelectedText() {
    if (!crepe) return '';
    try {
      const view = crepe.editor.ctx.get(editorViewCtx);
      const { from, to } = view.state.selection;
      return from === to ? '' : view.state.doc.textBetween(from, to);
    } catch { return ''; }
  },

  /** Insert or replace selection with a link node. */
  insertLink(text, url) {
    if (!crepe) return;
    try {
      const view = crepe.editor.ctx.get(editorViewCtx);
      if (!view.hasFocus()) view.focus();
      const { state, dispatch } = view;
      const linkMark = state.schema.marks.link.create({ href: url });
      const textNode = state.schema.text(text, [linkMark]);
      dispatch(state.tr.replaceSelectionWith(textNode, false).scrollIntoView());
    } catch { /* ignore */ }
  },

  /** Toggle blockquote: if already in a blockquote, unwrap to paragraph; otherwise wrap. */
  toggleBlockquote() {
    if (!crepe) return;
    try {
      const view = crepe.editor.ctx.get(editorViewCtx);
      if (!view.hasFocus()) view.focus();
      const { state, dispatch } = view;
      const { $from, $to } = state.selection;
      // Check if cursor is inside a blockquote
      for (let d = $from.depth; d > 0; d--) {
        if ($from.node(d).type.name === 'blockquote') {
          // Lift all content inside the blockquote out of it
          const before = $from.before(d);
          const after = $from.after(d);
          const range = state.doc.resolve(before + 1).blockRange(state.doc.resolve(after - 1));
          if (range) {
            dispatch(state.tr.lift(range, d - 1).scrollIntoView());
          }
          return;
        }
      }
      // Not in blockquote — normalize heading to paragraph, then wrap
      crepe.editor.action(callCommand(wrapInHeadingCommand.key, 0));
      crepe.editor.action(callCommand(wrapInBlockquoteCommand.key));
    } catch { /* ignore */ }
  },

  /** Toggle a list type: if already in that list, unwrap to paragraph; otherwise wrap. */
  toggleList(listNodeName, wrapCmd) {
    if (!crepe) return;
    try {
      const view = crepe.editor.ctx.get(editorViewCtx);
      if (!view.hasFocus()) view.focus();
      const { $from } = view.state.selection;
      // Walk up the node tree to check if we're inside the target list type
      for (let d = $from.depth; d > 0; d--) {
        if ($from.node(d).type.name === listNodeName) {
          // Already in this list type — lift out to paragraph
          crepe.editor.action(callCommand(liftListItemCommand.key));
          return;
        }
      }
      // Not in a list — normalize heading to paragraph, then wrap
      crepe.editor.action(callCommand(wrapInHeadingCommand.key, 0));
      crepe.editor.action(callCommand(wrapCmd));
    } catch { /* ignore */ }
  },

  // Expose command keys for toolbar.
  // Uses getters because $command sets .key lazily during plugin init,
  // so it's undefined at module evaluation time.
  commands: {
    get undo() { return undoCommand.key; },
    get redo() { return redoCommand.key; },
    get toggleBold() { return toggleStrongCommand.key; },
    get toggleItalic() { return toggleEmphasisCommand.key; },
    get toggleStrikethrough() { return toggleStrikethroughCommand.key; },
    get toggleCode() { return toggleInlineCodeCommand.key; },
    get toggleLink() { return toggleLinkCommand.key; },
    get wrapHeading() { return wrapInHeadingCommand.key; },
    get wrapBulletList() { return wrapInBulletListCommand.key; },
    get wrapOrderedList() { return wrapInOrderedListCommand.key; },
    get wrapBlockquote() { return wrapInBlockquoteCommand.key; },
    get liftListItem() { return liftListItemCommand.key; },
    get turnIntoText() { return turnIntoTextCommand.key; },
    get insertHr() { return insertHrCommand.key; },
    get createCodeBlock() { return createCodeBlockCommand.key; },
    get insertImage() { return insertImageCommand.key; },
  },

  getMarkdown() {
    if (!crepe) return null;
    try {
      return crepe.getMarkdown();
    } catch {
      return null;
    }
  },

  async destroy() {
    if (crepe) {
      try { await crepe.destroy(); } catch { /* ignore */ }
      crepe = null;
    }
  },
};
