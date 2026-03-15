/**
 * Canvas renderer for the whiteboard mode.
 * Draws cards, text labels, edges with arrowheads, grid, and selection highlights.
 */

const CARD_RADIUS = 8;
const CARD_HEADER_H = 32;
const RESIZE_HANDLE_SIZE = 10;
const ARROW_SIZE = 10;
const GRID_SIZE = 24;

const PRESET_COLORS = [
  '#ffffff', '#dbeafe', '#d1fae5', '#fef9c3',
  '#fce7f3', '#ede9fe', '#ffedd5', '#e5e7eb',
];

export { PRESET_COLORS, CARD_HEADER_H, RESIZE_HANDLE_SIZE };

export class CanvasRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
  }

  get isDark() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  }

  resize() {
    const { canvas, dpr } = this;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Get CSS variable value. */
  _css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  /** Main draw call. */
  draw(data, { offsetX, offsetY, zoom, selectedIds, hoveredId, mode, connectingFrom }) {
    const { ctx, canvas, dpr } = this;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = this.isDark ? '#1a1a2e' : '#f8f9fa';
    ctx.fillRect(0, 0, w, h);

    // Grid
    this._drawGrid(w, h, offsetX, offsetY, zoom);

    // Transform to world
    ctx.translate(offsetX, offsetY);
    ctx.scale(zoom, zoom);

    // Draw edges
    for (const edge of data.edges) {
      const from = data.nodes.find(n => n.id === edge.from);
      const to = data.nodes.find(n => n.id === edge.to);
      if (!from || !to) continue;
      this._drawEdge(from, to, edge, selectedIds.has(edge.id));
    }

    // Draw in-progress connection line
    if (connectingFrom) {
      this._drawConnectingLine(connectingFrom, zoom, offsetX, offsetY);
    }

    // Draw nodes (text labels first, then cards on top)
    const textNodes = data.nodes.filter(n => n.type === 'text');
    const cardNodes = data.nodes.filter(n => n.type === 'card');

    for (const node of textNodes) {
      this._drawTextLabel(node, selectedIds.has(node.id));
    }

    for (const node of cardNodes) {
      this._drawCard(node, selectedIds.has(node.id), hoveredId === node.id);
    }

    ctx.restore();
  }

  _drawGrid(w, h, offsetX, offsetY, zoom) {
    const { ctx } = this;
    const gridSize = GRID_SIZE * zoom;
    if (gridSize < 6) return; // Skip grid when zoomed out far

    ctx.fillStyle = this.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
    const dotR = Math.max(1, zoom * 1.2);

    const startX = offsetX % gridSize;
    const startY = offsetY % gridSize;

    for (let x = startX; x < w; x += gridSize) {
      for (let y = startY; y < h; y += gridSize) {
        ctx.beginPath();
        ctx.arc(x, y, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  _drawCard(node, isSelected, isHovered) {
    const { ctx } = this;
    const { x, y, width, height, title, content, color, linkedFile } = node;

    // Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.12)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;

    // Card body
    const bodyColor = this.isDark ? this._darkenColor(color) : color;
    ctx.fillStyle = bodyColor;
    this._roundRect(x, y, width, height, CARD_RADIUS);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Header bar
    const headerColor = this.isDark ? this._darkenColor(color, 0.8) : this._darkenColor(color, 0.92);
    ctx.fillStyle = headerColor;
    this._roundRectTop(x, y, width, CARD_HEADER_H, CARD_RADIUS);
    ctx.fill();

    // Header divider
    ctx.strokeStyle = this.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + CARD_HEADER_H);
    ctx.lineTo(x + width, y + CARD_HEADER_H);
    ctx.stroke();

    // Border
    ctx.strokeStyle = isSelected
      ? '#3b82f6'
      : isHovered
        ? (this.isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)')
        : (this.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)');
    ctx.lineWidth = isSelected ? 2.5 : 1;
    this._roundRect(x, y, width, height, CARD_RADIUS);
    ctx.stroke();

    // Title text
    const textColor = this.isDark ? '#e0e0e0' : '#1f2937';
    ctx.fillStyle = textColor;
    ctx.font = `600 13px ${this._css('--font-sans') || 'system-ui'}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    const titleX = x + 10;
    const titleMaxW = width - 20 - (linkedFile ? 18 : 0);
    ctx.save();
    ctx.beginPath();
    ctx.rect(titleX, y, titleMaxW, CARD_HEADER_H);
    ctx.clip();
    ctx.fillText(title || 'Untitled', titleX, y + CARD_HEADER_H / 2);
    ctx.restore();

    // File link icon
    if (linkedFile) {
      ctx.fillStyle = this.isDark ? '#9ca3af' : '#6b7280';
      ctx.font = '12px system-ui';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText('\u{1F4C4}', x + width - 8, y + CARD_HEADER_H / 2);
    }

    // Content preview
    if (content && height > CARD_HEADER_H + 20) {
      ctx.fillStyle = this.isDark ? '#9ca3af' : '#6b7280';
      ctx.font = `11px ${this._css('--font-sans') || 'system-ui'}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      const contentY = y + CARD_HEADER_H + 8;
      const contentMaxW = width - 20;
      const lines = this._wrapText(content, contentMaxW);
      const maxLines = Math.floor((height - CARD_HEADER_H - 16) / 16);

      for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
        ctx.fillText(lines[i], x + 10, contentY + i * 16);
      }
    }

    // Resize handle (bottom-right corner)
    if (isSelected) {
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      const hx = x + width - RESIZE_HANDLE_SIZE;
      const hy = y + height - RESIZE_HANDLE_SIZE;
      ctx.moveTo(x + width, y + height - RESIZE_HANDLE_SIZE);
      ctx.lineTo(x + width, y + height);
      ctx.lineTo(x + width - RESIZE_HANDLE_SIZE, y + height);
      ctx.closePath();
      ctx.fill();
    }
  }

  _drawTextLabel(node, isSelected) {
    const { ctx } = this;
    const { x, y, text, fontSize } = node;

    ctx.font = `${fontSize || 16}px ${this._css('--font-sans') || 'system-ui'}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = this.isDark ? '#d1d5db' : '#374151';
    ctx.fillText(text || '', x, y);

    if (isSelected) {
      const metrics = ctx.measureText(text || '');
      const th = (fontSize || 16) * 1.3;
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x - 4, y - 4, metrics.width + 8, th + 8);
      ctx.setLineDash([]);
    }
  }

  _drawEdge(from, to, edge, isSelected) {
    const { ctx } = this;

    // Compute connection points on card edges
    const p1 = this._edgePoint(from, to);
    const p2 = this._edgePoint(to, from);

    ctx.strokeStyle = isSelected ? '#3b82f6' : (edge.color || '#888888');
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    // Arrowhead at p2
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    ctx.fillStyle = isSelected ? '#3b82f6' : (edge.color || '#888888');
    ctx.beginPath();
    ctx.moveTo(p2.x, p2.y);
    ctx.lineTo(
      p2.x - ARROW_SIZE * Math.cos(angle - Math.PI / 6),
      p2.y - ARROW_SIZE * Math.sin(angle - Math.PI / 6),
    );
    ctx.lineTo(
      p2.x - ARROW_SIZE * Math.cos(angle + Math.PI / 6),
      p2.y - ARROW_SIZE * Math.sin(angle + Math.PI / 6),
    );
    ctx.closePath();
    ctx.fill();

    // Edge label
    if (edge.label) {
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      ctx.fillStyle = this.isDark ? '#9ca3af' : '#6b7280';
      ctx.font = `11px ${this._css('--font-sans') || 'system-ui'}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(edge.label, midX, midY - 4);
    }
  }

  _drawConnectingLine(info, zoom, offsetX, offsetY) {
    if (!info.node || !info.mouseWorld) return;
    const { ctx } = this;
    const p1 = this._nodeCenter(info.node);

    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(info.mouseWorld.x, info.mouseWorld.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /** Get center of a node. */
  _nodeCenter(node) {
    if (node.type === 'card') {
      return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
    }
    return { x: node.x, y: node.y };
  }

  /** Compute the point on a node's boundary toward another node. */
  _edgePoint(from, to) {
    const fc = this._nodeCenter(from);
    const tc = this._nodeCenter(to);
    const dx = tc.x - fc.x;
    const dy = tc.y - fc.y;

    if (from.type === 'card') {
      const hw = from.width / 2;
      const hh = from.height / 2;
      if (dx === 0 && dy === 0) return fc;

      // Intersect ray from center to target with card rectangle
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      let t;
      if (absDx * hh > absDy * hw) {
        t = hw / absDx;
      } else {
        t = hh / absDy;
      }
      return { x: fc.x + dx * t, y: fc.y + dy * t };
    }

    // Text nodes: just return center
    return fc;
  }

  /** Hit test: find the topmost element at canvas coordinates. Returns { type, element } or null. */
  hitTest(data, canvasX, canvasY, offsetX, offsetY, zoom) {
    // Convert canvas coords to world coords
    const wx = (canvasX - offsetX) / zoom;
    const wy = (canvasY - offsetY) / zoom;

    // Check cards in reverse order (topmost first)
    for (let i = data.nodes.length - 1; i >= 0; i--) {
      const node = data.nodes[i];
      if (node.type === 'card') {
        // Resize handle
        if (
          wx >= node.x + node.width - RESIZE_HANDLE_SIZE &&
          wx <= node.x + node.width &&
          wy >= node.y + node.height - RESIZE_HANDLE_SIZE &&
          wy <= node.y + node.height
        ) {
          return { type: 'resize', element: node };
        }
        // Card body
        if (wx >= node.x && wx <= node.x + node.width && wy >= node.y && wy <= node.y + node.height) {
          // Distinguish header click
          if (wy <= node.y + CARD_HEADER_H) {
            return { type: 'card-header', element: node };
          }
          return { type: 'card', element: node };
        }
      } else if (node.type === 'text') {
        // Approximate text bounds
        const w = (node.text || '').length * (node.fontSize || 16) * 0.6;
        const h = (node.fontSize || 16) * 1.3;
        if (wx >= node.x - 4 && wx <= node.x + w + 4 && wy >= node.y - 4 && wy <= node.y + h + 4) {
          return { type: 'text', element: node };
        }
      }
    }

    // Check edges
    for (const edge of data.edges) {
      const from = data.nodes.find(n => n.id === edge.from);
      const to = data.nodes.find(n => n.id === edge.to);
      if (!from || !to) continue;

      const p1 = this._edgePoint(from, to);
      const p2 = this._edgePoint(to, from);
      const dist = this._pointToSegmentDist(wx, wy, p1.x, p1.y, p2.x, p2.y);
      if (dist < 6) {
        return { type: 'edge', element: edge };
      }
    }

    return null;
  }

  _pointToSegmentDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  _roundRect(x, y, w, h, r) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  _roundRectTop(x, y, w, h, r) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  _wrapText(text, maxWidth) {
    const words = text.split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      const w = this.ctx.measureText(test).width;
      if (w > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  _darkenColor(hex, factor = 0.3) {
    // Convert hex to RGB, darken for dark mode
    let r = 128, g = 128, b = 128;
    if (hex && hex.startsWith('#')) {
      const c = hex.slice(1);
      if (c.length === 6) {
        r = parseInt(c.slice(0, 2), 16);
        g = parseInt(c.slice(2, 4), 16);
        b = parseInt(c.slice(4, 6), 16);
      }
    }
    r = Math.round(r * factor);
    g = Math.round(g * factor);
    b = Math.round(b * factor);
    return `rgb(${r},${g},${b})`;
  }

  /** Convert canvas coordinates to world coordinates. */
  canvasToWorld(cx, cy, offsetX, offsetY, zoom) {
    return {
      x: (cx - offsetX) / zoom,
      y: (cy - offsetY) / zoom,
    };
  }
}
