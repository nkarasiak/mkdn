/**
 * Lightweight force-directed graph simulation.
 * Forces: repulsion (all pairs), attraction (edges), center gravity, damping.
 * Uses Barnes-Hut quadtree for O(n log n) repulsion.
 */

const REPULSION = 3000;
const ATTRACTION = 0.005;
const CENTER_GRAVITY = 0.01;
const DAMPING = 0.9;
const MIN_DISTANCE = 30;
const MAX_SPEED = 50;

export class GraphPhysics {
  constructor() {
    this.alpha = 1.0;
    this.alphaMin = 0.001;
    this.alphaDecay = 0.02;
    this.running = false;
  }

  /** Run one tick of the simulation. Returns true if still active. */
  tick(nodes, edges) {
    if (this.alpha < this.alphaMin) {
      this.running = false;
      return false;
    }

    const nodeArr = Array.from(nodes.values());
    if (nodeArr.length === 0) return false;

    // Reset forces
    for (const n of nodeArr) {
      n.fx = 0;
      n.fy = 0;
    }

    // Repulsion (pairwise, Barnes-Hut for large graphs)
    if (nodeArr.length > 100) {
      this._barnesHutRepulsion(nodeArr);
    } else {
      this._pairwiseRepulsion(nodeArr);
    }

    // Attraction along edges
    for (const edge of edges) {
      const source = nodes.get(edge.source);
      const target = nodes.get(edge.target);
      if (!source || !target) continue;

      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;

      const strength = ATTRACTION * edge.weight * (edge.type === 'wikilink' ? 2 : 0.5);
      const fx = dx * strength;
      const fy = dy * strength;

      source.fx += fx;
      source.fy += fy;
      target.fx -= fx;
      target.fy -= fy;
    }

    // Center gravity
    for (const n of nodeArr) {
      n.fx -= n.x * CENTER_GRAVITY;
      n.fy -= n.y * CENTER_GRAVITY;
    }

    // Apply forces with damping
    for (const n of nodeArr) {
      if (n.fixed) continue;

      n.vx = (n.vx + n.fx * this.alpha) * DAMPING;
      n.vy = (n.vy + n.fy * this.alpha) * DAMPING;

      // Clamp speed
      const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
      if (speed > MAX_SPEED) {
        n.vx = (n.vx / speed) * MAX_SPEED;
        n.vy = (n.vy / speed) * MAX_SPEED;
      }

      n.x += n.vx;
      n.y += n.vy;
    }

    this.alpha -= this.alphaDecay;
    this.running = true;
    return true;
  }

  /** Reheat the simulation (e.g., after drag interaction). */
  reheat(amount = 0.3) {
    this.alpha = Math.min(1.0, this.alpha + amount);
    this.running = true;
  }

  _pairwiseRepulsion(nodes) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];

        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MIN_DISTANCE) dist = MIN_DISTANCE;

        const force = REPULSION / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        a.fx -= fx;
        a.fy -= fy;
        b.fx += fx;
        b.fy += fy;
      }
    }
  }

  /** Barnes-Hut quadtree approximation for repulsion. */
  _barnesHutRepulsion(nodes) {
    const tree = this._buildQuadtree(nodes);
    for (const node of nodes) {
      this._applyQuadtreeForce(node, tree);
    }
  }

  _buildQuadtree(nodes) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodes) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }
    const padding = 10;
    const root = { x: minX - padding, y: minY - padding, w: maxX - minX + 2 * padding, h: maxY - minY + 2 * padding, mass: 0, cx: 0, cy: 0, children: null, node: null };

    for (const n of nodes) {
      this._insertIntoQuadtree(root, n);
    }

    return root;
  }

  _insertIntoQuadtree(quad, node) {
    if (quad.mass === 0) {
      quad.node = node;
      quad.mass = 1;
      quad.cx = node.x;
      quad.cy = node.y;
      return;
    }

    if (!quad.children) {
      // Subdivide
      const hw = quad.w / 2;
      const hh = quad.h / 2;
      quad.children = [
        { x: quad.x, y: quad.y, w: hw, h: hh, mass: 0, cx: 0, cy: 0, children: null, node: null },
        { x: quad.x + hw, y: quad.y, w: hw, h: hh, mass: 0, cx: 0, cy: 0, children: null, node: null },
        { x: quad.x, y: quad.y + hh, w: hw, h: hh, mass: 0, cx: 0, cy: 0, children: null, node: null },
        { x: quad.x + hw, y: quad.y + hh, w: hw, h: hh, mass: 0, cx: 0, cy: 0, children: null, node: null },
      ];
      if (quad.node) {
        this._insertIntoQuadtree(this._getQuadrant(quad, quad.node), quad.node);
        quad.node = null;
      }
    }

    this._insertIntoQuadtree(this._getQuadrant(quad, node), node);
    quad.cx = (quad.cx * quad.mass + node.x) / (quad.mass + 1);
    quad.cy = (quad.cy * quad.mass + node.y) / (quad.mass + 1);
    quad.mass++;
  }

  _getQuadrant(quad, node) {
    const mx = quad.x + quad.w / 2;
    const my = quad.y + quad.h / 2;
    const i = (node.x < mx ? 0 : 1) + (node.y < my ? 0 : 2);
    return quad.children[i];
  }

  _applyQuadtreeForce(node, quad) {
    if (quad.mass === 0) return;
    if (quad.node === node) return;

    let dx = quad.cx - node.x;
    let dy = quad.cy - node.y;
    let dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < MIN_DISTANCE) dist = MIN_DISTANCE;

    const theta = 0.7; // Barnes-Hut parameter
    if (quad.children && quad.w / dist > theta) {
      for (const child of quad.children) {
        this._applyQuadtreeForce(node, child);
      }
    } else {
      const force = REPULSION * quad.mass / (dist * dist);
      node.fx -= (dx / dist) * force;
      node.fy -= (dy / dist) * force;
    }
  }
}
