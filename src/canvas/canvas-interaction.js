/**
 * Interaction handler for the canvas whiteboard.
 * Manages select, drag, pan, zoom, resize, connect modes and undo/redo.
 */

import { createCard, createTextLabel, createEdge } from './canvas-data.js';
import { PRESET_COLORS } from './canvas-renderer.js';

const MIN_CARD_W = 120;
const MIN_CARD_H = 60;

export class CanvasInteraction {
  constructor(canvas, renderer, { getData, setData, requestDraw, onOpenFile, onCanvasChanged }) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.getData = getData;
    this.setData = setData;
    this.requestDraw = requestDraw;
    this.onOpenFile = onOpenFile;
    this.onCanvasChanged = onCanvasChanged;

    this.offsetX = 0;
    this.offsetY = 0;
    this.zoom = 1;

    /** @type {'select'|'addCard'|'addText'|'addConnection'} */
    this.mode = 'select';

    /** @type {Set<string>} */
    this.selectedIds = new Set();
    this.hoveredId = null;

    // Drag state
    this._panning = false;
    this._dragging = false;
    this._resizing = null;
    this._moved = false;
    this._lastX = 0;
    this._lastY = 0;

    // Connection drawing state
    this.connectingFrom = null; // { node, mouseWorld }

    // Undo/redo
    this._undoStack = [];
    this._redoStack = [];

    // Context menu reference
    this._contextMenu = null;

    // Bind event handlers
    this._handlers = {
      mousedown: this._onMouseDown.bind(this),
      mousemove: this._onMouseMove.bind(this),
      mouseup: this._onMouseUp.bind(this),
      wheel: this._onWheel.bind(this),
      dblclick: this._onDblClick.bind(this),
      contextmenu: this._onContextMenu.bind(this),
      keydown: this._onKeyDown.bind(this),
    };

    canvas.addEventListener('mousedown', this._handlers.mousedown);
    canvas.addEventListener('mousemove', this._handlers.mousemove);
    canvas.addEventListener('mouseup', this._handlers.mouseup);
    canvas.addEventListener('mouseleave', this._handlers.mouseup);
    canvas.addEventListener('wheel', this._handlers.wheel, { passive: false });
    canvas.addEventListener('dblclick', this._handlers.dblclick);
    canvas.addEventListener('contextmenu', this._handlers.contextmenu);
    document.addEventListener('keydown', this._handlers.keydown);
  }

  destroy() {
    const { canvas } = this;
    canvas.removeEventListener('mousedown', this._handlers.mousedown);
    canvas.removeEventListener('mousemove', this._handlers.mousemove);
    canvas.removeEventListener('mouseup', this._handlers.mouseup);
    canvas.removeEventListener('mouseleave', this._handlers.mouseup);
    canvas.removeEventListener('wheel', this._handlers.wheel);
    canvas.removeEventListener('dblclick', this._handlers.dblclick);
    canvas.removeEventListener('contextmenu', this._handlers.contextmenu);
    document.removeEventListener('keydown', this._handlers.keydown);
    this._closeContextMenu();
  }

  _getCanvasPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  _toWorld(cx, cy) {
    return this.renderer.canvasToWorld(cx, cy, this.offsetX, this.offsetY, this.zoom);
  }

  _hitTest(cx, cy) {
    return this.renderer.hitTest(this.getData(), cx, cy, this.offsetX, this.offsetY, this.zoom);
  }

  /** Push current state to undo stack. */
  pushUndo() {
    const data = this.getData();
    this._undoStack.push(JSON.stringify(data));
    if (this._undoStack.length > 50) this._undoStack.shift();
    this._redoStack = [];
  }

  undo() {
    if (this._undoStack.length === 0) return;
    const data = this.getData();
    this._redoStack.push(JSON.stringify(data));
    const prev = JSON.parse(this._undoStack.pop());
    this.setData(prev);
    this.selectedIds.clear();
    this.requestDraw();
    this.onCanvasChanged();
  }

  redo() {
    if (this._redoStack.length === 0) return;
    const data = this.getData();
    this._undoStack.push(JSON.stringify(data));
    const next = JSON.parse(this._redoStack.pop());
    this.setData(next);
    this.selectedIds.clear();
    this.requestDraw();
    this.onCanvasChanged();
  }

  // --- Mouse Events ---

  _onMouseDown(e) {
    if (e.button === 2) return; // right-click handled by contextmenu
    this._closeContextMenu();

    const pos = this._getCanvasPos(e);
    this._lastX = pos.x;
    this._lastY = pos.y;
    this._moved = false;

    const data = this.getData();

    // Handle add modes
    if (this.mode === 'addCard') {
      this.pushUndo();
      const world = this._toWorld(pos.x, pos.y);
      const card = createCard(world.x - 100, world.y - 60);
      data.nodes.push(card);
      this.selectedIds.clear();
      this.selectedIds.add(card.id);
      this.mode = 'select';
      this.requestDraw();
      this.onCanvasChanged();
      this._promptEdit(card, 'title');
      return;
    }

    if (this.mode === 'addText') {
      this.pushUndo();
      const world = this._toWorld(pos.x, pos.y);
      const label = createTextLabel(world.x, world.y);
      data.nodes.push(label);
      this.selectedIds.clear();
      this.selectedIds.add(label.id);
      this.mode = 'select';
      this.requestDraw();
      this.onCanvasChanged();
      this._promptEdit(label, 'text');
      return;
    }

    if (this.mode === 'addConnection') {
      const hit = this._hitTest(pos.x, pos.y);
      if (hit && (hit.type === 'card' || hit.type === 'card-header' || hit.type === 'text')) {
        const world = this._toWorld(pos.x, pos.y);
        this.connectingFrom = { node: hit.element, mouseWorld: world };
        this.requestDraw();
      }
      return;
    }

    // Select mode
    const hit = this._hitTest(pos.x, pos.y);

    if (hit) {
      if (hit.type === 'resize') {
        this._resizing = hit.element;
        this.pushUndo();
        return;
      }

      const id = hit.element.id;
      if (e.shiftKey) {
        if (this.selectedIds.has(id)) {
          this.selectedIds.delete(id);
        } else {
          this.selectedIds.add(id);
        }
      } else if (!this.selectedIds.has(id)) {
        this.selectedIds.clear();
        this.selectedIds.add(id);
      }

      if (hit.type !== 'edge') {
        this._dragging = true;
        this.pushUndo();
      }

      this.requestDraw();
    } else {
      if (!e.shiftKey) this.selectedIds.clear();
      this._panning = true;
      this.canvas.style.cursor = 'grabbing';
      this.requestDraw();
    }
  }

  _onMouseMove(e) {
    const pos = this._getCanvasPos(e);
    const dx = pos.x - this._lastX;
    const dy = pos.y - this._lastY;

    if (this.connectingFrom) {
      this.connectingFrom.mouseWorld = this._toWorld(pos.x, pos.y);
      this.requestDraw();
      this._lastX = pos.x;
      this._lastY = pos.y;
      return;
    }

    if (this._resizing) {
      this._moved = true;
      const node = this._resizing;
      node.width = Math.max(MIN_CARD_W, node.width + dx / this.zoom);
      node.height = Math.max(MIN_CARD_H, node.height + dy / this.zoom);
      this.requestDraw();
      this.onCanvasChanged();
    } else if (this._dragging) {
      this._moved = true;
      const data = this.getData();
      const worldDx = dx / this.zoom;
      const worldDy = dy / this.zoom;
      for (const node of data.nodes) {
        if (this.selectedIds.has(node.id)) {
          node.x += worldDx;
          node.y += worldDy;
        }
      }
      this.requestDraw();
      this.onCanvasChanged();
    } else if (this._panning) {
      this._moved = true;
      this.offsetX += dx;
      this.offsetY += dy;
      this.requestDraw();
    } else {
      // Hover
      const hit = this._hitTest(pos.x, pos.y);
      const newHovered = hit ? hit.element.id : null;
      if (newHovered !== this.hoveredId) {
        this.hoveredId = newHovered;
        this.requestDraw();
      }

      if (hit) {
        this.canvas.style.cursor = hit.type === 'resize' ? 'nwse-resize' : 'pointer';
      } else {
        this.canvas.style.cursor = this.mode === 'select' ? 'grab' : 'crosshair';
      }
    }

    this._lastX = pos.x;
    this._lastY = pos.y;
  }

  _onMouseUp(e) {
    if (this.connectingFrom) {
      const pos = this._getCanvasPos(e);
      const hit = this._hitTest(pos.x, pos.y);
      if (hit && (hit.type === 'card' || hit.type === 'card-header' || hit.type === 'text')) {
        const target = hit.element;
        if (target.id !== this.connectingFrom.node.id) {
          this.pushUndo();
          const data = this.getData();
          const edge = createEdge(this.connectingFrom.node.id, target.id);
          data.edges.push(edge);
          this.onCanvasChanged();
        }
      }
      this.connectingFrom = null;
      this.mode = 'select';
      this.requestDraw();
      return;
    }

    this._dragging = false;
    this._resizing = null;
    this._panning = false;
    this.canvas.style.cursor = this.mode === 'select' ? 'grab' : 'crosshair';
  }

  _onWheel(e) {
    e.preventDefault();
    const pos = this._getCanvasPos(e);
    const delta = -e.deltaY * 0.001;
    const newZoom = Math.min(4, Math.max(0.15, this.zoom * (1 + delta)));
    const ratio = newZoom / this.zoom;

    this.offsetX = pos.x - ratio * (pos.x - this.offsetX);
    this.offsetY = pos.y - ratio * (pos.y - this.offsetY);
    this.zoom = newZoom;

    this.requestDraw();
  }

  _onDblClick(e) {
    const pos = this._getCanvasPos(e);
    const hit = this._hitTest(pos.x, pos.y);
    if (!hit) return;

    if (hit.type === 'card-header') {
      this._promptEdit(hit.element, 'title');
    } else if (hit.type === 'card') {
      if (hit.element.linkedFile) {
        this.onOpenFile?.(hit.element.linkedFile);
      } else {
        this._promptEdit(hit.element, 'content');
      }
    } else if (hit.type === 'text') {
      this._promptEdit(hit.element, 'text');
    } else if (hit.type === 'edge') {
      this._promptEdit(hit.element, 'label');
    }
  }

  _onContextMenu(e) {
    e.preventDefault();
    const pos = this._getCanvasPos(e);
    const hit = this._hitTest(pos.x, pos.y);

    this._closeContextMenu();

    const items = [];

    if (hit && (hit.type === 'card' || hit.type === 'card-header')) {
      const node = hit.element;
      this.selectedIds.clear();
      this.selectedIds.add(node.id);
      this.requestDraw();

      items.push(
        { label: 'Edit Title', action: () => this._promptEdit(node, 'title') },
        { label: 'Edit Content', action: () => this._promptEdit(node, 'content') },
        { label: 'Link File...', action: () => this._promptLinkFile(node) },
        { type: 'separator' },
        { label: 'Color', submenu: PRESET_COLORS.map(c => ({
          label: c === '#ffffff' ? 'White' : c,
          color: c,
          action: () => { this.pushUndo(); node.color = c; this.requestDraw(); this.onCanvasChanged(); },
        })) },
        { type: 'separator' },
        { label: 'Delete', action: () => this._deleteSelected() },
      );
    } else if (hit && hit.type === 'text') {
      const node = hit.element;
      this.selectedIds.clear();
      this.selectedIds.add(node.id);
      this.requestDraw();

      items.push(
        { label: 'Edit Text', action: () => this._promptEdit(node, 'text') },
        { label: 'Delete', action: () => this._deleteSelected() },
      );
    } else if (hit && hit.type === 'edge') {
      const edge = hit.element;
      this.selectedIds.clear();
      this.selectedIds.add(edge.id);
      this.requestDraw();

      items.push(
        { label: 'Edit Label', action: () => this._promptEdit(edge, 'label') },
        { label: 'Delete', action: () => this._deleteSelected() },
      );
    } else {
      const world = this._toWorld(pos.x, pos.y);
      items.push(
        { label: 'Add Card Here', action: () => {
          this.pushUndo();
          const card = createCard(world.x - 100, world.y - 60);
          this.getData().nodes.push(card);
          this.selectedIds.clear();
          this.selectedIds.add(card.id);
          this.requestDraw();
          this.onCanvasChanged();
        }},
        { label: 'Add Text Here', action: () => {
          this.pushUndo();
          const label = createTextLabel(world.x, world.y);
          this.getData().nodes.push(label);
          this.selectedIds.clear();
          this.selectedIds.add(label.id);
          this.requestDraw();
          this.onCanvasChanged();
        }},
      );
    }

    this._showContextMenu(e.clientX, e.clientY, items);
  }

  _onKeyDown(e) {
    // Only handle when canvas panel is in the DOM
    if (!this.canvas.closest('.canvas-panel')) return;

    if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedIds.size > 0) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      e.preventDefault();
      this._deleteSelected();
    }

    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.undo();
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        this.redo();
      } else if (e.key === 'a') {
        e.preventDefault();
        const data = this.getData();
        this.selectedIds.clear();
        for (const n of data.nodes) this.selectedIds.add(n.id);
        for (const ed of data.edges) this.selectedIds.add(ed.id);
        this.requestDraw();
      }
    }

    if (e.key === 'Escape') {
      if (this.connectingFrom) {
        this.connectingFrom = null;
        this.mode = 'select';
        this.requestDraw();
        e.preventDefault();
        e.stopPropagation();
      } else if (this.selectedIds.size > 0) {
        this.selectedIds.clear();
        this.requestDraw();
        e.preventDefault();
        e.stopPropagation();
      }
    }
  }

  // --- Actions ---

  _deleteSelected() {
    if (this.selectedIds.size === 0) return;
    this.pushUndo();
    const data = this.getData();
    const ids = this.selectedIds;

    data.edges = data.edges.filter(e =>
      !ids.has(e.id) && !ids.has(e.from) && !ids.has(e.to),
    );
    data.nodes = data.nodes.filter(n => !ids.has(n.id));

    this.selectedIds.clear();
    this.requestDraw();
    this.onCanvasChanged();
  }

  _promptEdit(element, field) {
    const current = element[field] || '';
    const label = field === 'title' ? 'Title' : field === 'content' ? 'Content' : field === 'text' ? 'Text' : 'Label';
    const value = prompt(`${label}:`, current);
    if (value !== null && value !== current) {
      this.pushUndo();
      element[field] = value;
      this.requestDraw();
      this.onCanvasChanged();
    }
  }

  _promptLinkFile(node) {
    let localSync;
    try {
      localSync = window.__mkdn_localSync;
    } catch { /* ignore */ }

    if (localSync && localSync.isLinked()) {
      const files = localSync.getFiles();
      if (files.length > 0) {
        const names = files.map(f => f.name).join('\n');
        const choice = prompt(`Enter file name to link:\n\nAvailable files:\n${names}`, node.linkedFile || '');
        if (choice !== null) {
          this.pushUndo();
          node.linkedFile = choice || null;
          if (choice && !node.title) node.title = choice.replace(/\.md$/, '');
          this.requestDraw();
          this.onCanvasChanged();
        }
        return;
      }
    }

    const choice = prompt('Enter file name to link:', node.linkedFile || '');
    if (choice !== null) {
      this.pushUndo();
      node.linkedFile = choice || null;
      this.requestDraw();
      this.onCanvasChanged();
    }
  }

  // --- Context Menu ---

  _showContextMenu(clientX, clientY, items) {
    this._closeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'canvas-context-menu';
    menu.style.left = clientX + 'px';
    menu.style.top = clientY + 'px';

    for (const item of items) {
      if (item.type === 'separator') {
        const sep = document.createElement('div');
        sep.className = 'canvas-ctx-separator';
        menu.appendChild(sep);
        continue;
      }

      if (item.submenu) {
        const sub = document.createElement('div');
        sub.className = 'canvas-ctx-item canvas-ctx-submenu';
        sub.textContent = item.label;

        const subMenu = document.createElement('div');
        subMenu.className = 'canvas-ctx-submenu-panel';

        for (const si of item.submenu) {
          const sItem = document.createElement('div');
          sItem.className = 'canvas-ctx-color-item';
          if (si.color) {
            sItem.style.backgroundColor = si.color;
            sItem.title = si.label;
          } else {
            sItem.textContent = si.label;
          }
          sItem.addEventListener('click', (ev) => {
            ev.stopPropagation();
            si.action();
            this._closeContextMenu();
          });
          subMenu.appendChild(sItem);
        }

        sub.appendChild(subMenu);
        menu.appendChild(sub);
        continue;
      }

      const el = document.createElement('div');
      el.className = 'canvas-ctx-item';
      el.textContent = item.label;
      el.addEventListener('click', () => {
        item.action();
        this._closeContextMenu();
      });
      menu.appendChild(el);
    }

    document.body.appendChild(menu);
    this._contextMenu = menu;

    setTimeout(() => {
      this._contextClickHandler = (ev) => {
        if (!menu.contains(ev.target)) {
          this._closeContextMenu();
        }
      };
      document.addEventListener('mousedown', this._contextClickHandler);
    }, 0);
  }

  _closeContextMenu() {
    if (this._contextMenu) {
      this._contextMenu.remove();
      this._contextMenu = null;
    }
    if (this._contextClickHandler) {
      document.removeEventListener('mousedown', this._contextClickHandler);
      this._contextClickHandler = null;
    }
  }

  /** Center the view on all content. */
  fitToView() {
    const data = this.getData();
    if (data.nodes.length === 0) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of data.nodes) {
      const nw = n.type === 'card' ? n.width : 100;
      const nh = n.type === 'card' ? n.height : 30;
      if (n.x < minX) minX = n.x;
      if (n.x + nw > maxX) maxX = n.x + nw;
      if (n.y < minY) minY = n.y;
      if (n.y + nh > maxY) maxY = n.y + nh;
    }

    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.width / dpr;
    const h = this.canvas.height / dpr;
    const padding = 80;

    const contentW = maxX - minX || 200;
    const contentH = maxY - minY || 200;
    this.zoom = Math.min((w - padding * 2) / contentW, (h - padding * 2) / contentH, 2);

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    this.offsetX = w / 2 - centerX * this.zoom;
    this.offsetY = h / 2 - centerY * this.zoom;

    this.requestDraw();
  }
}
