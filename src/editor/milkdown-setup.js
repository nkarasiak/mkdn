// CrepeBuilder + only the features we use: the `Crepe` class statically pulls in
// every feature (KaTeX, slash menu, block handle, toolbar) even when disabled.
import { CrepeBuilder } from '@milkdown/crepe/builder';
import { codeMirror } from '@milkdown/crepe/feature/code-mirror';
import { cursor } from '@milkdown/crepe/feature/cursor';
import { imageBlock } from '@milkdown/crepe/feature/image-block';
import { linkTooltip } from '@milkdown/crepe/feature/link-tooltip';
import { listItem } from '@milkdown/crepe/feature/list-item';
import { placeholder } from '@milkdown/crepe/feature/placeholder';
import { table } from '@milkdown/crepe/feature/table';
import { languages } from '@codemirror/language-data';
import { oneDark } from '@codemirror/theme-one-dark';
import { editorViewCtx, commandsCtx, serializerCtx } from '@milkdown/core';
import { replaceAll, $prose } from '@milkdown/utils';
import { TextSelection, Plugin } from '@milkdown/prose/state';
import { toggleLinkCommand } from '@milkdown/components/link-tooltip';
import { documentStore } from '../store/document-store.js';
import { settingsStore } from '../store/settings-store.js';
import { eventBus } from '../store/event-bus.js';
import { storage } from '../storage/local-storage.js';
import { debounce } from '../utils/debounce.js';
import { STORAGE_SNAPSHOT } from '../constants.js';
import { createFindReplacePlugin } from '../find-replace/find-replace-plugin.js';
import { createImagePastePlugin } from './image-paste-plugin.js';
import { createSmartPastePlugin } from './smart-paste-plugin.js';

// Crepe CSS: common/style.css minus block-edit, toolbar and latex (KaTeX fonts)
import '@milkdown/crepe/theme/common/prosemirror.css';
import '@milkdown/crepe/theme/common/reset.css';
import '@milkdown/crepe/theme/common/code-mirror.css';
import '@milkdown/crepe/theme/common/cursor.css';
import '@milkdown/crepe/theme/common/image-block.css';
import '@milkdown/crepe/theme/common/link-tooltip.css';
import '@milkdown/crepe/theme/common/list-item.css';
import '@milkdown/crepe/theme/common/placeholder.css';
import '@milkdown/crepe/theme/common/table.css';
import '@milkdown/crepe/theme/frame.css';

let crepe = null;
let updating = false;

// Editor → store sync. Serializing is the costly part, so it waits for a typing pause,
// but the first edit syncs at once (instant "*") and every store read flushes first
// (documentStore.setFlusher): a save or tab switch never sees stale or misrouted text.
let pending = false;
let syncTimer = null;
let loaded = null; // markdown the editor shows, untouched since (null once edited)

function flush() {
  if (!pending) return;
  pending = false;
  clearTimeout(syncTimer);
  const doc = crepe.editor.ctx.get(editorViewCtx).state.doc;
  documentStore.setMarkdown(crepe.editor.ctx.get(serializerCtx)(doc), 'milkdown');
}

// Rendered HTML of the document, painted by app.js at the next start while this chunk loads.
function saveSnapshot() {
  const view = milkdown.getView();
  if (!view || settingsStore.get('sourceMode')) return; // editor DOM is stale in source mode
  const html = view.dom.outerHTML;
  if (html.length > 500_000) storage.remove(STORAGE_SNAPSHOT); // e.g. pasted images: not worth the quota
  else storage.set(STORAGE_SNAPSHOT, { markdown: documentStore.getMarkdown(), html });
}

const syncPlugin = () => new Plugin({
  state: {
    init: () => null,
    apply(tr) {
      if (updating || !tr.docChanged || tr.getMeta('addToHistory') === false) return null;
      pending = true;
      loaded = null;
      clearTimeout(syncTimer);
      // After the dispatch (view.state is current then), not inside it.
      if (documentStore.isDirty()) syncTimer = setTimeout(flush, 300);
      else queueMicrotask(flush);
      return null;
    },
  },
});

const sourceTextarea = () => document.querySelector('.source-editor');

export const milkdown = {
  async init(container) {
    // No block handle / slash menu / selection toolbar: plain page, keyboard-driven.
    crepe = new CrepeBuilder({ root: container, defaultValue: documentStore.getMarkdown() })
      .addFeature(cursor)
      .addFeature(listItem)
      .addFeature(linkTooltip)
      .addFeature(imageBlock)
      .addFeature(placeholder, { text: 'Start writing...', mode: 'doc' })
      .addFeature(codeMirror, { theme: oneDark, languages })
      .addFeature(table);

    crepe.editor.use($prose(syncPlugin));
    crepe.editor.use($prose(() => createFindReplacePlugin()));
    crepe.editor.use($prose(() => createImagePastePlugin()));
    crepe.editor.use($prose(() => createSmartPastePlugin()));
    await crepe.create();
    documentStore.setFlusher(flush);
    loaded = documentStore.getMarkdown();

    eventBus.on('content:changed', debounce(saveSnapshot, 2000));
    addEventListener('pagehide', saveSnapshot);
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveSnapshot(); });

    // No spellcheck / autocorrect / autocapitalize (WebKit honours the last two).
    for (const [k, v] of [['spellcheck', 'false'], ['autocorrect', 'off'], ['autocapitalize', 'off']]) {
      this.getView().dom.setAttribute(k, v);
    }

    // Route Milkdown's link command (Mod-K) to our link popover.
    const cmds = crepe.editor.ctx.get(commandsCtx);
    cmds.create(toggleLinkCommand.key, () => () => {
      import('../ui/link-popover.js').then(m => m.openLinkPopover());
      return true;
    });

    // Listen for external content changes (file-open, new-document)
    eventBus.on('content:changed', ({ content, source }) => {
      if (source === 'milkdown' || source === 'source-editor') return;
      this.setContent(content);
    });
  },

  setContent(markdown) {
    if (!crepe || markdown === loaded) return; // already shown (e.g. tab restore at startup): skip the re-parse
    try {
      updating = true;
      pending = false; // edits to the replaced document were already flushed (or are discarded)
      clearTimeout(syncTimer);
      crepe.editor.action(replaceAll(markdown));
      loaded = markdown;
    } catch { /* editor may not be ready */ }
    finally {
      updating = false;
    }
  },

  /** Return the currently selected text in the editor, or '' if no selection. */
  getSelectedText() {
    if (settingsStore.get('sourceMode')) {
      const ta = sourceTextarea();
      return ta ? ta.value.substring(ta.selectionStart, ta.selectionEnd) : '';
    }
    const view = this.getView();
    if (!view) return '';
    const { from, to } = view.state.selection;
    return from === to ? '' : view.state.doc.textBetween(from, to);
  },

  /** Insert or replace selection with a link. Caller validates the URL. */
  insertLink(text, url) {
    if (settingsStore.get('sourceMode')) {
      const ta = sourceTextarea();
      if (!ta) return;
      ta.focus();
      ta.setRangeText(`[${text}](${url})`, ta.selectionStart, ta.selectionEnd, 'end');
      ta.dispatchEvent(new Event('input'));
      return;
    }
    const view = this.getView();
    if (!view) return;
    view.focus();
    const { state, dispatch } = view;
    const linkMark = state.schema.marks.link.create({ href: url });
    dispatch(state.tr.replaceSelectionWith(state.schema.text(text, [linkMark]), false).scrollIntoView());
  },

  /** Get the ProseMirror editor view. */
  getView() {
    if (!crepe) return null;
    try {
      return crepe.editor.ctx.get(editorViewCtx);
    } catch { return null; }
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
