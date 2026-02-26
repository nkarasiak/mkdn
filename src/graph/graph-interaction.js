/**
 * Handles pan, zoom, hover, drag, and click interactions for the graph canvas.
 */
export class GraphInteraction {
  constructor(canvas, { onHover, onDragStart, onDrag, onDragEnd, onClick, onViewChange }) {
    this.canvas = canvas;
    this.onHover = onHover;
    this.onDragStart = onDragStart;
    this.onDrag = onDrag;
    this.onDragEnd = onDragEnd;
    this.onClick = onClick;
    this.onViewChange = onViewChange;

    this.offsetX = 0;
    this.offsetY = 0;
    this.zoom = 1;

    this._panning = false;
    this._draggingNode = null;
    this._panStartX = 0;
    this._panStartY = 0;
    this._lastMoveX = 0;
    this._lastMoveY = 0;
    this._moved = false;

    this._boundMouseDown = this._onMouseDown.bind(this);
    this._boundMouseMove = this._onMouseMove.bind(this);
    this._boundMouseUp = this._onMouseUp.bind(this);
    this._boundWheel = this._onWheel.bind(this);
    this._boundTouchStart = this._onTouchStart.bind(this);
    this._boundTouchMove = this._onTouchMove.bind(this);
    this._boundTouchEnd = this._onTouchEnd.bind(this);

    canvas.addEventListener('mousedown', this._boundMouseDown);
    canvas.addEventListener('mousemove', this._boundMouseMove);
    canvas.addEventListener('mouseup', this._boundMouseUp);
    canvas.addEventListener('mouseleave', this._boundMouseUp);
    canvas.addEventListener('wheel', this._boundWheel, { passive: false });
    canvas.addEventListener('touchstart', this._boundTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this._boundTouchMove, { passive: false });
    canvas.addEventListener('touchend', this._boundTouchEnd, { passive: false });

    this._pinchStartDist = 0;
    this._pinchStartZoom = 1;
  }

  destroy() {
    const { canvas } = this;
    canvas.removeEventListener('mousedown', this._boundMouseDown);
    canvas.removeEventListener('mousemove', this._boundMouseMove);
    canvas.removeEventListener('mouseup', this._boundMouseUp);
    canvas.removeEventListener('mouseleave', this._boundMouseUp);
    canvas.removeEventListener('wheel', this._boundWheel);
    canvas.removeEventListener('touchstart', this._boundTouchStart);
    canvas.removeEventListener('touchmove', this._boundTouchMove);
    canvas.removeEventListener('touchend', this._boundTouchEnd);
  }

  getCanvasPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  _onMouseDown(e) {
    const pos = this.getCanvasPos(e);
    this._lastMoveX = pos.x;
    this._lastMoveY = pos.y;
    this._moved = false;

    // Check if clicking on a node
    const node = this.onHover?.(pos.x, pos.y);
    if (node) {
      this._draggingNode = node;
      this.onDragStart?.(node);
    } else {
      this._panning = true;
      this._panStartX = pos.x;
      this._panStartY = pos.y;
    }
  }

  _onMouseMove(e) {
    const pos = this.getCanvasPos(e);

    if (this._draggingNode) {
      this._moved = true;
      const dx = pos.x - this._lastMoveX;
      const dy = pos.y - this._lastMoveY;
      this.onDrag?.(this._draggingNode, dx / this.zoom, dy / this.zoom);
    } else if (this._panning) {
      this._moved = true;
      const dx = pos.x - this._lastMoveX;
      const dy = pos.y - this._lastMoveY;
      this.offsetX += dx;
      this.offsetY += dy;
      this.onViewChange?.();
    } else {
      // Hover detection
      this.onHover?.(pos.x, pos.y);
    }

    this._lastMoveX = pos.x;
    this._lastMoveY = pos.y;
  }

  _onMouseUp(e) {
    if (this._draggingNode) {
      if (!this._moved) {
        this.onClick?.(this._draggingNode);
      }
      this.onDragEnd?.(this._draggingNode);
      this._draggingNode = null;
    } else if (this._panning && !this._moved) {
      // Click on background — deselect
    }
    this._panning = false;
  }

  _onWheel(e) {
    e.preventDefault();
    const pos = this.getCanvasPos(e);

    const delta = -e.deltaY * 0.001;
    const newZoom = Math.min(4, Math.max(0.1, this.zoom * (1 + delta)));
    const ratio = newZoom / this.zoom;

    // Zoom toward cursor
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.width / dpr;
    const h = this.canvas.height / dpr;
    const cx = pos.x - w / 2;
    const cy = pos.y - h / 2;

    this.offsetX = cx - ratio * (cx - this.offsetX);
    this.offsetY = cy - ratio * (cy - this.offsetY);
    this.zoom = newZoom;

    this.onViewChange?.();
  }

  // Touch support
  _onTouchStart(e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      this._pinchStartDist = Math.sqrt(dx * dx + dy * dy);
      this._pinchStartZoom = this.zoom;
      return;
    }

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      this._onMouseDown({ clientX: touch.clientX, clientY: touch.clientY });
    }
  }

  _onTouchMove(e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      this.zoom = Math.min(4, Math.max(0.1, this._pinchStartZoom * (dist / this._pinchStartDist)));
      this.onViewChange?.();
      return;
    }

    if (e.touches.length === 1) {
      e.preventDefault();
      const touch = e.touches[0];
      this._onMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
    }
  }

  _onTouchEnd(e) {
    if (e.touches.length === 0) {
      const touch = e.changedTouches[0];
      this._onMouseUp({ clientX: touch.clientX, clientY: touch.clientY });
    }
  }

  /** Fit all nodes into view. */
  fitToView(nodes) {
    if (nodes.size === 0) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodes.values()) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }

    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.width / dpr;
    const h = this.canvas.height / dpr;
    const padding = 60;

    const graphW = maxX - minX || 100;
    const graphH = maxY - minY || 100;
    this.zoom = Math.min((w - padding * 2) / graphW, (h - padding * 2) / graphH, 2);

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    this.offsetX = -centerX * this.zoom;
    this.offsetY = -centerY * this.zoom;

    this.onViewChange?.();
  }
}
