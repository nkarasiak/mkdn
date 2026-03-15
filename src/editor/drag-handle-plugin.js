import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import { el, injectStyles } from '../utils/dom.js';
import { milkdown } from './milkdown-setup.js';

const pluginKey = new PluginKey('drag-handle');

// Inject drag handle styles
injectStyles(`
.drag-handle-wrapper {
  position: fixed;
  display: flex;
  align-items: center;
  gap: 2px;
  z-index: 10;
  opacity: 0;
  transition: opacity 0.15s ease;
  user-select: none;
}
.editor-pane:hover .drag-handle-wrapper {
  opacity: 0.35;
}
.drag-handle-wrapper:hover {
  opacity: 1 !important;
}
.drag-handle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: var(--radius-sm, 4px);
  color: var(--text-muted, #999);
  cursor: grab;
  transition: background 0.1s ease;
}
.drag-handle:hover {
  background: var(--bg-hover, #f5f5f5);
  color: var(--text-secondary, #6b6b6b);
}
.drag-handle.dragging {
  cursor: grabbing;
}
.drag-handle-plus {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: var(--radius-sm, 4px);
  color: var(--text-muted, #999);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  background: none;
  border: none;
  padding: 0;
  transition: background 0.1s ease, color 0.1s ease;
}
.drag-handle-plus:hover {
  background: var(--accent-light, #fdf3e7);
  color: var(--accent, #E8850C);
}
.drag-drop-line {
  position: fixed;
  height: 2px;
  background: var(--accent, #E8850C);
  border-radius: 1px;
  z-index: 10;
  pointer-events: none;
}
.block-type-label {
  position: fixed;
  font-family: var(--font-sans);
  font-size: 9px;
  font-weight: 600;
  color: var(--text-tertiary, #bbb);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s ease;
  z-index: 10;
}
.drag-handle-wrapper:hover ~ .block-type-label,
.block-type-label.visible {
  opacity: 1;
}

/* Block actions menu */
.block-actions-menu {
  position: fixed;
  min-width: 180px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  z-index: 300;
  padding: 4px;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px);
  transition: opacity 0.12s ease, transform 0.12s ease, visibility 0.12s ease;
}
.block-actions-menu.visible {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}
.block-action-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  font-family: var(--font-sans);
  font-size: var(--font-size-sm, 13px);
  color: var(--text-primary);
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  text-align: left;
  cursor: pointer;
  transition: background 0.08s ease;
}
.block-action-item:hover {
  background: var(--bg-hover);
}
.block-action-icon {
  width: 16px;
  text-align: center;
  font-size: 12px;
  flex-shrink: 0;
}
.block-action-sep {
  height: 1px;
  background: var(--border-light);
  margin: 3px 8px;
}
.block-action-item.danger:hover {
  background: color-mix(in srgb, var(--error) 10%, transparent);
  color: var(--error);
}
`);

/**
 * Creates a ProseMirror plugin that shows a drag handle (grip icon) and plus button
 * on the left of each top-level block when hovered. Supports drag to reorder and
 * a block actions menu (duplicate, delete, convert, move up/down).
 */
export function createDragHandlePlugin() {
  let wrapperEl = null;
  let handleEl = null;
  let plusEl = null;
  let dropLineEl = null;
  let blockMenuEl = null;
  let typeLabelEl = null;
  let draggedPos = null;
  let targetPos = null;
  let currentBlockPos = null;

  function ensureElements() {
    if (wrapperEl) return;

    handleEl = document.createElement('div');
    handleEl.className = 'drag-handle';
    handleEl.setAttribute('draggable', 'true');
    handleEl.setAttribute('aria-label', 'Drag to reorder');
    handleEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="5" cy="3" r="1.5"/><circle cx="11" cy="3" r="1.5"/>
      <circle cx="5" cy="8" r="1.5"/><circle cx="11" cy="8" r="1.5"/>
      <circle cx="5" cy="13" r="1.5"/><circle cx="11" cy="13" r="1.5"/>
    </svg>`;

    plusEl = document.createElement('button');
    plusEl.className = 'drag-handle-plus';
    plusEl.setAttribute('aria-label', 'Add block');
    plusEl.textContent = '+';

    wrapperEl = document.createElement('div');
    wrapperEl.className = 'drag-handle-wrapper';
    wrapperEl.style.display = 'none';
    wrapperEl.appendChild(plusEl);
    wrapperEl.appendChild(handleEl);
    document.body.appendChild(wrapperEl);

    dropLineEl = document.createElement('div');
    dropLineEl.className = 'drag-drop-line';
    dropLineEl.style.display = 'none';
    document.body.appendChild(dropLineEl);

    typeLabelEl = document.createElement('div');
    typeLabelEl.className = 'block-type-label';
    document.body.appendChild(typeLabelEl);

    // Block actions menu
    blockMenuEl = document.createElement('div');
    blockMenuEl.className = 'block-actions-menu';
    document.body.appendChild(blockMenuEl);
  }

  function hideHandle() {
    if (wrapperEl) wrapperEl.style.display = 'none';
    if (typeLabelEl) typeLabelEl.classList.remove('visible');
  }

  function hideDropLine() {
    if (dropLineEl) dropLineEl.style.display = 'none';
  }

  function hideBlockMenu() {
    if (blockMenuEl) blockMenuEl.classList.remove('visible');
  }

  function getBlockTypeName(node) {
    if (!node) return '';
    const name = node.type.name;
    if (name === 'heading') return `H${node.attrs.level}`;
    if (name === 'paragraph') return 'P';
    if (name === 'bullet_list') return 'List';
    if (name === 'ordered_list') return 'OL';
    if (name === 'blockquote') return 'Quote';
    if (name === 'code_block') return 'Code';
    if (name === 'table') return 'Table';
    if (name === 'horizontal_rule') return 'HR';
    return name.replace(/_/g, ' ');
  }

  function showBlockMenu(view, pos) {
    const { doc } = view.state;
    const node = doc.nodeAt(pos);
    if (!node) return;

    blockMenuEl.replaceChildren();

    const actionBtn = (icon, label, onClick, className = '') => {
      const btn = el('button', {
        className: `block-action-item ${className}`.trim(),
        onMousedown: (e) => { e.preventDefault(); e.stopPropagation(); },
        onClick: () => { onClick(); hideBlockMenu(); },
      },
        el('span', { className: 'block-action-icon' }, icon),
        el('span', {}, label),
      );
      return btn;
    };

    const sep = () => el('div', { className: 'block-action-sep' });

    // Duplicate
    blockMenuEl.appendChild(actionBtn('\u{1F4CB}', 'Duplicate', () => {
      const { state, dispatch } = view;
      const endPos = pos + node.nodeSize;
      dispatch(state.tr.insert(endPos, node.copy(node.content)).scrollIntoView());
    }));

    // Move up
    if (pos > 0) {
      blockMenuEl.appendChild(actionBtn('\u2191', 'Move Up', () => {
        const { state, dispatch } = view;
        const $pos = state.doc.resolve(pos);
        if ($pos.index(0) === 0) return;
        const prevNode = state.doc.child($pos.index(0) - 1);
        const prevStart = pos - prevNode.nodeSize;
        let tr = state.tr;
        tr = tr.delete(pos, pos + node.nodeSize);
        tr = tr.insert(prevStart, node.copy(node.content));
        dispatch(tr.scrollIntoView());
      }));
    }

    // Move down
    const nodeEnd = pos + node.nodeSize;
    if (nodeEnd < doc.content.size) {
      blockMenuEl.appendChild(actionBtn('\u2193', 'Move Down', () => {
        const { state, dispatch } = view;
        const nextNode = state.doc.nodeAt(nodeEnd);
        if (!nextNode) return;
        let tr = state.tr;
        const afterNext = nodeEnd + nextNode.nodeSize;
        tr = tr.delete(pos, pos + node.nodeSize);
        const insertAt = Math.min(afterNext - node.nodeSize, tr.doc.content.size);
        tr = tr.insert(insertAt, node.copy(node.content));
        dispatch(tr.scrollIntoView());
      }));
    }

    blockMenuEl.appendChild(sep());

    // Convert to heading
    if (node.type.name === 'paragraph' || node.type.name === 'heading') {
      [1, 2, 3].forEach(level => {
        if (node.type.name === 'heading' && node.attrs.level === level) return;
        blockMenuEl.appendChild(actionBtn(`H${level}`, `Heading ${level}`, () => {
          const { state, dispatch } = view;
          const sel = state.selection.constructor.near(state.doc.resolve(pos + 1));
          dispatch(state.tr.setSelection(sel));
          milkdown.runCommand(milkdown.commands.wrapHeading, level);
        }));
      });
      if (node.type.name === 'heading') {
        blockMenuEl.appendChild(actionBtn('P', 'Normal Text', () => {
          const { state, dispatch } = view;
          const sel = state.selection.constructor.near(state.doc.resolve(pos + 1));
          dispatch(state.tr.setSelection(sel));
          milkdown.runCommand(milkdown.commands.wrapHeading, 0);
        }));
      }
      blockMenuEl.appendChild(sep());
    }

    // Copy as markdown
    blockMenuEl.appendChild(actionBtn('\u{1F4CB}', 'Copy as Markdown', () => {
      const md = milkdown.getMarkdown();
      // Approximate: get the text content of this block
      const text = node.textContent;
      navigator.clipboard?.writeText(text);
    }));

    blockMenuEl.appendChild(sep());

    // Delete
    blockMenuEl.appendChild(actionBtn('\u{1F5D1}', 'Delete', () => {
      const { state, dispatch } = view;
      dispatch(state.tr.delete(pos, pos + node.nodeSize).scrollIntoView());
    }, 'danger'));

    // Position
    const domNode = view.nodeDOM(pos);
    if (domNode instanceof HTMLElement) {
      const rect = domNode.getBoundingClientRect();
      blockMenuEl.style.left = `${rect.left}px`;
      blockMenuEl.style.top = `${rect.top + rect.height + 4}px`;

      // Clamp
      requestAnimationFrame(() => {
        const menuRect = blockMenuEl.getBoundingClientRect();
        if (menuRect.bottom > window.innerHeight - 8) {
          blockMenuEl.style.top = `${rect.top - menuRect.height - 4}px`;
        }
        if (menuRect.right > window.innerWidth - 8) {
          blockMenuEl.style.left = `${window.innerWidth - menuRect.width - 8}px`;
        }
      });
    }

    blockMenuEl.classList.add('visible');
  }

  return new Plugin({
    key: pluginKey,
    view(editorView) {
      ensureElements();

      function onMouseMove(e) {
        if (draggedPos !== null) return;
        const view = editorView;
        const { doc } = view.state;
        const pos = view.posAtCoords({ left: e.clientX, top: e.clientY });
        if (!pos) { hideHandle(); return; }

        const resolved = doc.resolve(pos.pos);
        const depth = resolved.depth;
        if (depth < 1) { hideHandle(); return; }

        const topPos = resolved.before(1);
        const node = doc.nodeAt(topPos);
        if (!node) { hideHandle(); return; }

        const domNode = view.nodeDOM(topPos);
        if (!domNode || !(domNode instanceof HTMLElement)) { hideHandle(); return; }

        const rect = domNode.getBoundingClientRect();
        const editorRect = view.dom.getBoundingClientRect();

        if (e.clientX > editorRect.left + 60) { hideHandle(); return; }

        currentBlockPos = topPos;
        wrapperEl.style.display = 'flex';
        wrapperEl.style.top = `${rect.top + 2}px`;
        wrapperEl.style.left = `${editorRect.left - 52}px`;
        handleEl.dataset.pos = String(topPos);

        // Show block type label
        const typeName = getBlockTypeName(node);
        if (typeName) {
          typeLabelEl.textContent = typeName;
          typeLabelEl.style.top = `${rect.top + 4}px`;
          typeLabelEl.style.left = `${editorRect.left - 80}px`;
        }
      }

      function onPlusClick(e) {
        e.preventDefault();
        e.stopPropagation();
        // Insert a new paragraph after current block and trigger slash menu
        if (currentBlockPos == null) return;
        const view = editorView;
        const { state, dispatch } = view;
        const node = state.doc.nodeAt(currentBlockPos);
        if (!node) return;
        const insertPos = currentBlockPos + node.nodeSize;
        const paragraph = state.schema.nodes.paragraph.create();
        let tr = state.tr.insert(insertPos, paragraph);
        // Set cursor in the new paragraph
        const newPos = insertPos + 1;
        tr = tr.setSelection(TextSelection.create(tr.doc, newPos));
        dispatch(tr.scrollIntoView());
        view.focus();
        // Type "/" to trigger slash menu
        requestAnimationFrame(() => {
          const { state: s, dispatch: d } = view;
          d(s.tr.insertText('/').scrollIntoView());
        });
      }

      function onHandleContextMenu(e) {
        e.preventDefault();
        e.stopPropagation();
        if (currentBlockPos == null) return;
        showBlockMenu(editorView, currentBlockPos);
      }

      function onDragStart(e) {
        if (!handleEl.dataset.pos) return;
        draggedPos = parseInt(handleEl.dataset.pos, 10);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setDragImage(new Image(), 0, 0);
        handleEl.classList.add('dragging');
      }

      function onDrag(e) {
        if (draggedPos === null || !e.clientY) return;
        const view = editorView;
        const pos = view.posAtCoords({ left: e.clientX, top: e.clientY });
        if (!pos) { hideDropLine(); return; }

        const resolved = view.state.doc.resolve(pos.pos);
        if (resolved.depth < 1) { hideDropLine(); return; }

        targetPos = resolved.before(1);
        const domNode = view.nodeDOM(targetPos);
        if (!domNode || !(domNode instanceof HTMLElement)) { hideDropLine(); return; }

        const rect = domNode.getBoundingClientRect();
        const editorRect = view.dom.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const insertBefore = e.clientY < midY;

        dropLineEl.style.display = 'block';
        dropLineEl.style.top = `${insertBefore ? rect.top - 1 : rect.bottom - 1}px`;
        dropLineEl.style.left = `${editorRect.left}px`;
        dropLineEl.style.width = `${editorRect.width}px`;

        if (!insertBefore) {
          const node = view.state.doc.nodeAt(targetPos);
          if (node) targetPos = targetPos + node.nodeSize;
        }
      }

      function onDragEnd() {
        handleEl.classList.remove('dragging');
        hideDropLine();

        if (draggedPos !== null && targetPos !== null && draggedPos !== targetPos) {
          const view = editorView;
          const { state } = view;
          const node = state.doc.nodeAt(draggedPos);
          if (node) {
            let tr = state.tr;
            const nodeSlice = state.doc.slice(draggedPos, draggedPos + node.nodeSize);
            tr = tr.delete(draggedPos, draggedPos + node.nodeSize);
            let insertAt = targetPos;
            if (targetPos > draggedPos) {
              insertAt -= node.nodeSize;
            }
            insertAt = Math.max(0, Math.min(insertAt, tr.doc.content.size));
            tr = tr.insert(insertAt, nodeSlice.content);
            view.dispatch(tr.scrollIntoView());
          }
        }

        draggedPos = null;
        targetPos = null;
      }

      function onDocClick(e) {
        if (!blockMenuEl?.contains(e.target)) {
          hideBlockMenu();
        }
      }

      const editorDom = editorView.dom.closest('.editor-pane') || editorView.dom.parentElement;
      editorDom.addEventListener('mousemove', onMouseMove);
      plusEl.addEventListener('click', onPlusClick);
      handleEl.addEventListener('contextmenu', onHandleContextMenu);
      handleEl.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentBlockPos != null) showBlockMenu(editorView, currentBlockPos);
      });
      handleEl.addEventListener('dragstart', onDragStart);
      handleEl.addEventListener('drag', onDrag);
      handleEl.addEventListener('dragend', onDragEnd);
      document.addEventListener('click', onDocClick);

      return {
        destroy() {
          editorDom.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('click', onDocClick);
          wrapperEl?.remove(); wrapperEl = null; handleEl = null; plusEl = null;
          dropLineEl?.remove(); dropLineEl = null;
          typeLabelEl?.remove(); typeLabelEl = null;
          blockMenuEl?.remove(); blockMenuEl = null;
        },
      };
    },
  });
}
