/**
 * Canvas renderer for the knowledge graph.
 * Draws nodes (circles), edges (lines), labels, and hover highlights.
 */

const NODE_RADIUS_BASE = 5;
const NODE_RADIUS_MAX = 18;
const LABEL_FONT_SIZE = 11;
const EDGE_COLOR_WIKILINK = 'rgba(150, 150, 150, 0.4)';
const EDGE_COLOR_SIMILARITY = 'rgba(100, 180, 255, 0.25)';
const EDGE_COLOR_HIGHLIGHT = 'rgba(232, 133, 12, 0.8)';

export class GraphRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
    this.isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  }

  resize() {
    const { canvas, dpr } = this;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
  }

  /** Main render call. */
  draw(nodes, edges, { offsetX, offsetY, zoom, hoveredNode, searchFilter, dimNonMatching }) {
    const { ctx, canvas, dpr } = this;
    this.isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    // Transform to world coordinates
    ctx.translate(w / 2 + offsetX, h / 2 + offsetY);
    ctx.scale(zoom, zoom);

    // Determine visible bounds for culling
    const halfW = (w / 2) / zoom;
    const halfH = (h / 2) / zoom;
    const viewMinX = -offsetX / zoom - halfW - 50;
    const viewMaxX = -offsetX / zoom + halfW + 50;
    const viewMinY = -offsetY / zoom - halfH - 50;
    const viewMaxY = -offsetY / zoom + halfH + 50;

    // Highlighted node IDs (hovered + neighbors)
    const highlightedIds = new Set();
    const highlightedEdges = new Set();
    if (hoveredNode) {
      highlightedIds.add(hoveredNode.id);
      edges.forEach((edge, i) => {
        if (edge.source === hoveredNode.id || edge.target === hoveredNode.id) {
          highlightedIds.add(edge.source);
          highlightedIds.add(edge.target);
          highlightedEdges.add(i);
        }
      });
    }

    // Draw edges
    edges.forEach((edge, i) => {
      const source = nodes.get(edge.source);
      const target = nodes.get(edge.target);
      if (!source || !target) return;

      // Culling: skip if both endpoints outside viewport
      if ((source.x < viewMinX && target.x < viewMinX) ||
          (source.x > viewMaxX && target.x > viewMaxX) ||
          (source.y < viewMinY && target.y < viewMinY) ||
          (source.y > viewMaxY && target.y > viewMaxY)) return;

      const isHighlighted = highlightedEdges.has(i);
      const isDimmed = hoveredNode && !isHighlighted;
      const isFiltered = searchFilter && dimNonMatching && !highlightedIds.has(edge.source) && !highlightedIds.has(edge.target);

      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);

      if (isHighlighted) {
        ctx.strokeStyle = EDGE_COLOR_HIGHLIGHT;
        ctx.lineWidth = 2;
      } else if (isDimmed || isFiltered) {
        ctx.strokeStyle = this.isDark ? 'rgba(100, 100, 100, 0.1)' : 'rgba(200, 200, 200, 0.15)';
        ctx.lineWidth = 0.5;
      } else {
        ctx.strokeStyle = edge.type === 'similarity' ? EDGE_COLOR_SIMILARITY : EDGE_COLOR_WIKILINK;
        ctx.lineWidth = edge.type === 'similarity' ? 0.5 : 1;
      }

      ctx.stroke();
    });

    // Draw nodes
    const nodeArr = Array.from(nodes.values());
    for (const node of nodeArr) {
      // Culling
      if (node.x < viewMinX || node.x > viewMaxX || node.y < viewMinY || node.y > viewMaxY) continue;

      const radius = this._nodeRadius(node);
      const isHighlighted = highlightedIds.has(node.id);
      const isDimmed = hoveredNode && !isHighlighted;
      const isFilterDimmed = searchFilter && dimNonMatching && !this._matchesFilter(node, searchFilter);

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);

      if (node.isCurrent) {
        ctx.fillStyle = '#E8850C';
      } else if (isHighlighted) {
        ctx.fillStyle = this.isDark ? '#f0a030' : '#E8850C';
      } else if (isDimmed || isFilterDimmed) {
        ctx.fillStyle = this.isDark ? 'rgba(100, 100, 100, 0.3)' : 'rgba(180, 180, 180, 0.3)';
      } else {
        ctx.fillStyle = this.isDark ? '#666' : '#aaa';
      }

      ctx.fill();

      // Label (skip at very low zoom)
      if (zoom > 0.4 && !(isDimmed && zoom < 0.8)) {
        ctx.font = `${LABEL_FONT_SIZE / Math.max(zoom, 0.6)}px ${getComputedStyle(document.documentElement).getPropertyValue('--font-sans')}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        if (isDimmed || isFilterDimmed) {
          ctx.fillStyle = this.isDark ? 'rgba(100, 100, 100, 0.3)' : 'rgba(160, 160, 160, 0.3)';
        } else if (isHighlighted || node.isCurrent) {
          ctx.fillStyle = this.isDark ? '#e0e0e0' : '#333';
        } else {
          ctx.fillStyle = this.isDark ? '#888' : '#666';
        }

        ctx.fillText(node.name, node.x, node.y + radius + 4);
      }
    }

    ctx.restore();
  }

  _nodeRadius(node) {
    return Math.min(NODE_RADIUS_BASE + node.linkCount * 1.5, NODE_RADIUS_MAX);
  }

  _matchesFilter(node, filter) {
    return node.name.toLowerCase().includes(filter.toLowerCase());
  }

  /** Hit test: find node at canvas coordinates. */
  hitTest(nodes, canvasX, canvasY, offsetX, offsetY, zoom) {
    const { canvas, dpr } = this;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    // Convert canvas coords to world coords
    const worldX = (canvasX - w / 2 - offsetX) / zoom;
    const worldY = (canvasY - h / 2 - offsetY) / zoom;

    let closest = null;
    let closestDist = Infinity;

    for (const node of nodes.values()) {
      const dx = node.x - worldX;
      const dy = node.y - worldY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const radius = this._nodeRadius(node) + 4; // Tolerance

      if (dist < radius && dist < closestDist) {
        closest = node;
        closestDist = dist;
      }
    }

    return closest;
  }
}
