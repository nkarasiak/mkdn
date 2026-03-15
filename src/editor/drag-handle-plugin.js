import { Plugin, PluginKey } from '@milkdown/prose/state';
import { injectStyles } from '../utils/dom.js';

const pluginKey = new PluginKey('drag-handle');

// Inject drag handle styles
injectStyles(`
.drag-handle {
  position: fixed;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: var(--radius-sm, 4px);
  color: var(--text-muted, #999);
  cursor: grab;
  opacity: 0;
  transition: opacity 0.15s ease, background 0.15s ease;
  z-index: 10;
  user-select: none;
}
.drag-handle:hover {
  opacity: 1 !important;
  background: var(--bg-hover, #f5f5f5);
  color: var(--text-secondary, #6b6b6b);
}
.editor-pane:hover .drag-handle {
  opacity: 0.4;
}
.drag-handle.dragging {
  opacity: 0.8;
  cursor: grabbing;
}
.drag-drop-line {
  position: fixed;
  height: 2px;
  background: var(--accent, #E8850C);
  border-radius: 1px;
  z-index: 10;
  pointer-events: none;
}
`);

/**
 * Creates a ProseMirror plugin that shows a drag handle (grip icon) on the left
 * of each top-level block when hovered. Blocks can be dragged to reorder.
 */
export function createDragHandlePlugin() {
  let handleEl = null;
  let dropLineEl = null;
  let draggedPos = null;
  let targetPos = null;

  function ensureHandleEl() {
    if (handleEl) return;
    handleEl = document.createElement('div');
    handleEl.className = 'drag-handle';
    handleEl.setAttribute('draggable', 'true');
    handleEl.setAttribute('aria-label', 'Drag to reorder');
    handleEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="5" cy="3" r="1.5"/><circle cx="11" cy="3" r="1.5"/>
      <circle cx="5" cy="8" r="1.5"/><circle cx="11" cy="8" r="1.5"/>
      <circle cx="5" cy="13" r="1.5"/><circle cx="11" cy="13" r="1.5"/>
    </svg>`;
    handleEl.style.display = 'none';
    document.body.appendChild(handleEl);

    dropLineEl = document.createElement('div');
    dropLineEl.className = 'drag-drop-line';
    dropLineEl.style.display = 'none';
    document.body.appendChild(dropLineEl);
  }

  function hideHandle() {
    if (handleEl) handleEl.style.display = 'none';
  }

  function hideDropLine() {
    if (dropLineEl) dropLineEl.style.display = 'none';
  }

  return new Plugin({
    key: pluginKey,
    view(editorView) {
      ensureHandleEl();

      function onMouseMove(e) {
        if (draggedPos !== null) return; // dragging in progress
        const view = editorView;
        const { doc } = view.state;
        const pos = view.posAtCoords({ left: e.clientX, top: e.clientY });
        if (!pos) { hideHandle(); return; }

        // Find the top-level block at this position
        const resolved = doc.resolve(pos.pos);
        const depth = resolved.depth;
        if (depth < 1) { hideHandle(); return; }

        // Get the top-level node (depth 1)
        const topPos = resolved.before(1);
        const node = doc.nodeAt(topPos);
        if (!node) { hideHandle(); return; }

        // Position the handle
        const domNode = view.nodeDOM(topPos);
        if (!domNode || !(domNode instanceof HTMLElement)) { hideHandle(); return; }

        const rect = domNode.getBoundingClientRect();
        const editorRect = view.dom.getBoundingClientRect();

        // Only show when mouse is near the left side of the editor
        if (e.clientX > editorRect.left + 60) { hideHandle(); return; }

        handleEl.style.display = 'flex';
        handleEl.style.top = `${rect.top + 4}px`;
        handleEl.style.left = `${editorRect.left - 28}px`;
        handleEl.dataset.pos = String(topPos);
      }

      function onDragStart(e) {
        if (!handleEl.dataset.pos) return;
        draggedPos = parseInt(handleEl.dataset.pos, 10);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setDragImage(new Image(), 0, 0); // hide default ghost
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
            // Delete original
            tr = tr.delete(draggedPos, draggedPos + node.nodeSize);
            // Recalculate target after deletion
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

      const editorDom = editorView.dom.closest('.editor-pane') || editorView.dom.parentElement;
      editorDom.addEventListener('mousemove', onMouseMove);
      handleEl.addEventListener('dragstart', onDragStart);
      handleEl.addEventListener('drag', onDrag);
      handleEl.addEventListener('dragend', onDragEnd);

      return {
        destroy() {
          editorDom.removeEventListener('mousemove', onMouseMove);
          if (handleEl) {
            handleEl.removeEventListener('dragstart', onDragStart);
            handleEl.removeEventListener('drag', onDrag);
            handleEl.removeEventListener('dragend', onDragEnd);
            handleEl.remove();
            handleEl = null;
          }
          if (dropLineEl) {
            dropLineEl.remove();
            dropLineEl = null;
          }
        },
      };
    },
  });
}
