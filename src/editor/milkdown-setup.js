import { Crepe } from '@milkdown/crepe';
import { editorViewCtx, commandsCtx } from '@milkdown/core';
import { replaceAll, callCommand, $prose } from '@milkdown/utils';
import { TextSelection } from '@milkdown/prose/state';
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
  blockquoteSchema,
  clearTextInCurrentBlockCommand,
} from '@milkdown/preset-commonmark';
import { undoCommand, redoCommand } from '@milkdown/plugin-history';
import { toggleLinkCommand } from '@milkdown/components/link-tooltip';
import { toggleStrikethroughCommand, insertTableCommand } from '@milkdown/preset-gfm';
import { documentStore } from '../store/document-store.js';
import { settingsStore } from '../store/settings-store.js';
import { eventBus } from '../store/event-bus.js';
import { createParagraphFocusPlugin } from '../focus/paragraph-focus-plugin.js';
import { createTypewriterPlugin } from '../focus/typewriter-plugin.js';
import { createEmbedPlugin } from './embed-plugin.js';
import { createFindReplacePlugin } from '../find-replace/find-replace-plugin.js';
import { createWikilinkPlugin } from '../backlinks/wikilink-plugin.js';
import { createImagePastePlugin } from './image-paste-plugin.js';
import { createMermaidPlugin } from './mermaid-plugin.js';
import { createCalloutPlugin } from './callout-plugin.js';
import { createEmojiPlugin } from './emoji-plugin.js';
import { createDetailsPlugin } from './details-plugin.js';
import { CrepeFeature } from '@milkdown/crepe';
import { sourceFormat, getSourceTextarea } from './source-formatter.js';

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
      featureConfigs: {
        [CrepeFeature.BlockEdit]: {
          buildMenu: (builder) => {
            const calloutGroup = builder.addGroup('callout', 'Callout');
            const calloutSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
            const calloutTypes = [
              { key: 'note', label: 'Note', prefix: '[!NOTE]' },
              { key: 'tip', label: 'Tip', prefix: '[!TIP]' },
              { key: 'warning', label: 'Warning', prefix: '[!WARNING]' },
              { key: 'caution', label: 'Caution', prefix: '[!CAUTION]' },
              { key: 'important', label: 'Important', prefix: '[!IMPORTANT]' },
            ];
            calloutTypes.forEach(({ key, label, prefix }) => {
              calloutGroup.addItem(`callout-${key}`, {
                label: `${label} Callout`,
                icon: calloutSvg,
                onRun: (ctx) => {
                  const commands = ctx.get(commandsCtx);
                  commands.call(clearTextInCurrentBlockCommand.key);
                  commands.call(wrapInBlockquoteCommand.key);
                  // Insert the callout type marker
                  const view = ctx.get(editorViewCtx);
                  const { state, dispatch } = view;
                  const { from } = state.selection;
                  dispatch(state.tr.insertText(`${prefix}\n`, from, from).scrollIntoView());
                },
              });
            });

            const insertGroup = builder.addGroup('extra-insert', 'Insert');
            insertGroup.addItem('toggle', {
              label: 'Toggle Block',
              icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg>',
              onRun: (ctx) => {
                const view = ctx.get(editorViewCtx);
                const { state, dispatch } = view;
                const text = '<details>\n<summary>Click to expand</summary>\n\nContent here\n\n</details>';
                dispatch(state.tr.insertText(text).scrollIntoView());
              },
            });
            insertGroup.addItem('date', {
              label: "Today's Date",
              icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
              onRun: (ctx) => {
                const view = ctx.get(editorViewCtx);
                const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
                const { state, dispatch } = view;
                dispatch(state.tr.insertText(date).scrollIntoView());
              },
            });
            insertGroup.addItem('template', {
              label: 'From Template',
              icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>',
              onRun: () => {
                import('../templates/template-system.js').then(m => m.openTemplateChooser());
              },
            });
          },
        },
      },
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

    // Register ProseMirror plugins
    crepe.editor.use($prose(() => createParagraphFocusPlugin()));
    crepe.editor.use($prose(() => createTypewriterPlugin()));
    crepe.editor.use($prose(() => createEmbedPlugin()));
    crepe.editor.use($prose(() => createFindReplacePlugin()));
    crepe.editor.use($prose(() => createWikilinkPlugin()));
    crepe.editor.use($prose(() => createImagePastePlugin()));
    crepe.editor.use($prose(() => createMermaidPlugin()));
    crepe.editor.use($prose(() => createCalloutPlugin()));
    crepe.editor.use($prose(() => createEmojiPlugin()));
    crepe.editor.use($prose(() => createDetailsPlugin()));
    await crepe.create();

    // Listen for focus mode toggle to refresh decorations
    eventBus.on('focus:refresh-plugins', () => {
      if (!crepe) return;
      try {
        const view = crepe.editor.ctx.get(editorViewCtx);
        const tr = view.state.tr.setMeta('focus-mode-toggle', true);
        view.dispatch(tr);
      } catch { /* editor may not be ready */ }
    });

    // Override toggleLinkCommand so all link triggers (floating toolbar,
    // keyboard shortcut) open our custom popover instead of Milkdown's default.
    const cmds = crepe.editor.ctx.get(commandsCtx);
    cmds.create(toggleLinkCommand.key, () => () => {
      import('../ui/link-popover.js').then(m => m.openLinkPopover());
      return true;
    });

    // Listen for external content changes (file-open, new-document)
    eventBus.on('content:changed', ({ content, source }) => {
      if (source === 'milkdown' || source === 'source-editor') return;
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
    // Source mode: map Milkdown command keys to sourceFormat calls
    if (settingsStore.get('sourceMode')) {
      const ta = getSourceTextarea();
      if (!ta) return;
      ta.focus();
      if (cmd === toggleStrongCommand.key) return sourceFormat.bold();
      if (cmd === toggleEmphasisCommand.key) return sourceFormat.italic();
      if (cmd === toggleStrikethroughCommand.key) return sourceFormat.strikethrough();
      if (cmd === toggleInlineCodeCommand.key) return sourceFormat.inlineCode();
      if (cmd === wrapInHeadingCommand.key) return sourceFormat.heading(payload ?? 0);
      if (cmd === wrapInBulletListCommand.key) return sourceFormat.bulletList();
      if (cmd === wrapInOrderedListCommand.key) return sourceFormat.orderedList();
      if (cmd === wrapInBlockquoteCommand.key) return sourceFormat.blockquote();
      if (cmd === insertHrCommand.key) return sourceFormat.hr();
      if (cmd === createCodeBlockCommand.key) return sourceFormat.codeBlock();
      if (cmd === toggleLinkCommand.key) return sourceFormat.link();
      // Undo/redo: fall through to let browser handle it on textarea
      return;
    }
    if (!crepe) return;
    try {
      const view = crepe.editor.ctx.get(editorViewCtx);
      if (!view.hasFocus()) view.focus();
      crepe.editor.action(callCommand(cmd, payload));
    } catch { /* ignore */ }
  },

  /** Return the currently selected text in the editor, or '' if no selection. */
  getSelectedText() {
    if (settingsStore.get('sourceMode')) {
      const ta = getSourceTextarea();
      if (!ta) return '';
      return ta.value.substring(ta.selectionStart, ta.selectionEnd);
    }
    if (!crepe) return '';
    try {
      const view = crepe.editor.ctx.get(editorViewCtx);
      const { from, to } = view.state.selection;
      return from === to ? '' : view.state.doc.textBetween(from, to);
    } catch { return ''; }
  },

  /** Insert a URL as a standalone link paragraph (triggers embed decoration). */
  insertEmbedUrl(url) {
    if (!crepe) return;
    try {
      const view = crepe.editor.ctx.get(editorViewCtx);
      if (!view.hasFocus()) view.focus();
      const { state, dispatch } = view;
      const linkMark = state.schema.marks.link.create({ href: url });
      const linkNode = state.schema.text(url, [linkMark]);
      const paragraph = state.schema.nodes.paragraph.create(null, linkNode);
      dispatch(state.tr.replaceSelectionWith(paragraph).scrollIntoView());
    } catch { /* ignore */ }
  },

  /** Insert or replace selection with a link node. */
  insertLink(text, url) {
    // Reject dangerous URL protocols
    try {
      const normalized = url.trim().replace(/\s/g, '');
      if (/^(javascript|data|vbscript):/i.test(normalized)) return;
    } catch { return; }

    if (settingsStore.get('sourceMode')) {
      sourceFormat.insertLink(text, url);
      return;
    }
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
    if (settingsStore.get('sourceMode')) {
      sourceFormat.blockquote();
      return;
    }
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
    if (settingsStore.get('sourceMode')) {
      if (listNodeName === 'bullet_list') sourceFormat.bulletList();
      else sourceFormat.orderedList();
      return;
    }
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
    get insertTable() { return insertTableCommand.key; },
  },

  /** Insert a table with the given number of rows and columns. */
  insertTable(row = 3, col = 3) {
    if (settingsStore.get('sourceMode')) {
      sourceFormat.table(row, col);
      return;
    }
    if (!crepe) return;
    try {
      const view = crepe.editor.ctx.get(editorViewCtx);
      if (!view.hasFocus()) view.focus();
      crepe.editor.action(callCommand(insertTableCommand.key, { row, col }));
    } catch { /* ignore */ }
  },

  /** Find the position of a heading node by text and level. */
  findHeadingPos(text, level) {
    if (!crepe) return null;
    try {
      const view = crepe.editor.ctx.get(editorViewCtx);
      let found = null;
      view.state.doc.descendants((node, pos) => {
        if (found != null) return false;
        if (node.type.name === 'heading' && node.attrs.level === level) {
          const nodeText = node.textContent.trim();
          if (nodeText === text) {
            found = pos + 1; // inside the heading
          }
        }
      });
      return found;
    } catch { return null; }
  },

  /** Scroll the editor to a given document position. */
  scrollToPos(pos) {
    if (!crepe) return;
    try {
      const view = crepe.editor.ctx.get(editorViewCtx);
      const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, pos));
      view.dispatch(tr.scrollIntoView());
      view.focus();
      // Fallback: also scroll the DOM node into view in case ProseMirror's
      // scrollIntoView doesn't reach the correct scroll container
      const domResult = view.domAtPos(pos);
      const node = domResult.node.nodeType === 1 ? domResult.node : domResult.node.parentElement;
      if (node) {
        const block = node.closest('h1,h2,h3,h4,h5,h6,p,li,pre,blockquote') || node;
        block.scrollIntoView({ block: 'nearest' });
      }
    } catch { /* ignore */ }
  },

  /** Return all heading positions in the ProseMirror document. */
  getHeadingPositions() {
    if (!crepe) return [];
    try {
      const view = crepe.editor.ctx.get(editorViewCtx);
      const headings = [];
      view.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading') {
          headings.push({ pos: pos + 1, level: node.attrs.level, text: node.textContent.trim() });
        }
      });
      return headings;
    } catch { return []; }
  },

  /** Get the ProseMirror editor view. */
  getView() {
    if (!crepe) return null;
    try {
      return crepe.editor.ctx.get(editorViewCtx);
    } catch { return null; }
  },

  getMarkdown() {
    if (!crepe) return null;
    try {
      return crepe.getMarkdown();
    } catch {
      return null;
    }
  },

  /**
   * Map the current ProseMirror cursor position to a character offset in the markdown string.
   * Uses a line-counting approach: finds which top-level block the cursor is in,
   * then counts through markdown lines to find the approximate offset.
   */
  getCursorAsMarkdownOffset(markdown) {
    if (!crepe) return 0;
    try {
      const view = crepe.editor.ctx.get(editorViewCtx);
      const { from } = view.state.selection;
      const doc = view.state.doc;

      // Find which top-level block contains the cursor and the offset within it
      let blockIndex = 0;
      let offsetInBlock = 0;
      let pos = 0;

      for (let i = 0; i < doc.childCount; i++) {
        const child = doc.child(i);
        const childStart = pos + 1; // +1 for the node opening
        const childEnd = childStart + child.content.size;

        if (from >= childStart && from <= childEnd) {
          blockIndex = i;
          offsetInBlock = from - childStart;
          break;
        }
        pos += child.nodeSize;
        if (from > childEnd) {
          blockIndex = i + 1;
          offsetInBlock = 0;
        }
      }

      // Now map blockIndex to markdown: split into top-level blocks
      // by looking for blank-line separators or consecutive content lines
      const lines = markdown.split('\n');
      let currentBlock = 0;
      let charOffset = 0;
      let blockStartOffset = 0;

      for (let i = 0; i < lines.length; i++) {
        if (currentBlock === blockIndex) {
          // Found the target block start
          blockStartOffset = charOffset;
          // Add approximate offset within block (clamped to block content)
          let blockLen = 0;
          for (let j = i; j < lines.length; j++) {
            if (j > i && lines[j] === '' && currentBlock === blockIndex) break;
            blockLen += lines[j].length + 1;
          }
          return Math.min(blockStartOffset + offsetInBlock, blockStartOffset + blockLen - 1);
        }

        charOffset += lines[i].length + 1; // +1 for newline

        // Detect block boundary: empty line between blocks
        if (lines[i] === '' && i > 0 && lines[i - 1] !== '') {
          currentBlock++;
        }
      }

      return Math.min(charOffset, markdown.length);
    } catch {
      return 0;
    }
  },

  /**
   * Map a markdown character offset to a ProseMirror position and set the cursor there.
   * Reverse of getCursorAsMarkdownOffset.
   */
  setCursorFromMarkdownOffset(markdown, offset) {
    if (!crepe) return;
    try {
      const view = crepe.editor.ctx.get(editorViewCtx);
      const doc = view.state.doc;

      // Find which markdown block the offset falls in
      const lines = markdown.split('\n');
      let currentBlock = 0;
      let charOffset = 0;
      let offsetInBlock = offset;

      for (let i = 0; i < lines.length; i++) {
        const lineEnd = charOffset + lines[i].length;

        if (offset <= lineEnd + 1) {
          offsetInBlock = offset - charOffset;
          break;
        }

        charOffset += lines[i].length + 1;

        if (lines[i] === '' && i > 0 && lines[i - 1] !== '') {
          currentBlock++;
          offsetInBlock = offset - charOffset;
        }
      }

      // Map blockIndex to ProseMirror position
      let pos = 0;
      const targetBlock = Math.min(currentBlock, doc.childCount - 1);

      for (let i = 0; i < doc.childCount; i++) {
        const child = doc.child(i);
        if (i === targetBlock) {
          const innerPos = pos + 1 + Math.min(Math.max(offsetInBlock, 0), child.content.size);
          const clamped = Math.min(innerPos, doc.content.size);
          const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, clamped));
          view.dispatch(tr.scrollIntoView());
          view.focus();
          return;
        }
        pos += child.nodeSize;
      }

      // Fallback: put cursor at start
      const tr = view.state.tr.setSelection(TextSelection.create(doc, 1));
      view.dispatch(tr.scrollIntoView());
      view.focus();
    } catch { /* ignore */ }
  },

  async destroy() {
    if (crepe) {
      try { await crepe.destroy(); } catch { /* ignore */ }
      crepe = null;
    }
  },
};
