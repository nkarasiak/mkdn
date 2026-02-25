import { el, injectStyles } from '../utils/dom.js';
import { collectGraphData } from './graph-data.js';
import { GraphPhysics } from './graph-physics.js';
import { GraphRenderer } from './graph-renderer.js';
import { GraphInteraction } from './graph-interaction.js';
import { localSync } from '../local/local-sync.js';
import { toast } from '../ui/toast.js';

let panelEl = null;
let animFrameId = null;

export function openGraphView() {
  if (panelEl) {
    closeGraphView();
    return;
  }

  if (!localSync.isLinked()) {
    toast('Link a folder first to view the knowledge graph', 'info');
    return;
  }

  // State
  let nodes = new Map();
  let edges = [];
  let hoveredNode = null;
  let searchFilter = '';
  let includeSemanticLinks = false;

  const physics = new GraphPhysics();

  // Build UI
  const canvas = el('canvas', { className: 'graph-canvas' });
  const renderer = new GraphRenderer(canvas);

  const searchInput = el('input', {
    type: 'text',
    className: 'graph-search',
    placeholder: 'Filter nodes...',
    onInput: (e) => {
      searchFilter = e.target.value;
      requestDraw();
    },
  });

  const semanticCheckbox = el('input', { type: 'checkbox' });
  semanticCheckbox.addEventListener('change', async () => {
    includeSemanticLinks = semanticCheckbox.checked;
    await loadData();
  });

  const semanticLabel = el('label', { className: 'graph-checkbox-label' },
    semanticCheckbox, 'Semantic links',
  );

  const fitBtn = el('button', {
    className: 'graph-toolbar-btn',
    onClick: () => {
      interaction.fitToView(nodes);
      requestDraw();
    },
  }, 'Fit');

  const closeBtn = el('button', {
    className: 'graph-toolbar-btn graph-close-btn',
    onClick: closeGraphView,
  }, '\u2715');

  const infoBar = el('div', { className: 'graph-info' }, '');

  const toolbar = el('div', { className: 'graph-toolbar' },
    el('span', { className: 'graph-title' }, 'Knowledge Graph'),
    searchInput,
    semanticLabel,
    fitBtn,
    closeBtn,
  );

  panelEl = el('div', { className: 'graph-panel' }, toolbar, canvas, infoBar);
  document.body.appendChild(panelEl);

  // Set up interaction
  const interaction = new GraphInteraction(canvas, {
    onHover: (cx, cy) => {
      hoveredNode = renderer.hitTest(nodes, cx, cy, interaction.offsetX, interaction.offsetY, interaction.zoom);
      canvas.style.cursor = hoveredNode ? 'pointer' : 'grab';
      updateInfo();
      requestDraw();
      return hoveredNode;
    },
    onDragStart: (node) => {
      node.fixed = true;
      physics.reheat();
      canvas.style.cursor = 'grabbing';
    },
    onDrag: (node, dx, dy) => {
      node.x += dx;
      node.y += dy;
      physics.reheat(0.1);
      requestDraw();
    },
    onDragEnd: (node) => {
      node.fixed = false;
      canvas.style.cursor = 'pointer';
    },
    onClick: (node) => {
      closeGraphView();
      localSync.open(node.path);
    },
    onViewChange: () => requestDraw(),
  });

  // Resize handler
  function resizeCanvas() {
    renderer.resize();
    requestDraw();
  }

  function updateInfo() {
    if (hoveredNode) {
      const linkCount = edges.filter(e => e.source === hoveredNode.id || e.target === hoveredNode.id).length;
      infoBar.textContent = `${hoveredNode.name} — ${linkCount} connection${linkCount !== 1 ? 's' : ''}`;
    } else {
      infoBar.textContent = `${nodes.size} nodes · ${edges.length} edges`;
    }
  }

  // Animation loop
  let drawRequested = false;
  function requestDraw() {
    drawRequested = true;
  }

  function animate() {
    const simActive = physics.tick(nodes, edges);

    if (simActive || drawRequested) {
      renderer.draw(nodes, edges, {
        offsetX: interaction.offsetX,
        offsetY: interaction.offsetY,
        zoom: interaction.zoom,
        hoveredNode,
        searchFilter,
        dimNonMatching: searchFilter.length > 0,
      });
      drawRequested = false;
      updateInfo();
    }

    animFrameId = requestAnimationFrame(animate);
  }

  // Keyboard handler
  function onKeyDown(e) {
    if (e.key === 'Escape') {
      closeGraphView();
      e.preventDefault();
    }
  }

  // Load data and start
  async function loadData() {
    infoBar.textContent = 'Loading graph data...';
    const data = await collectGraphData({ includeSemanticLinks });
    nodes = data.nodes;
    edges = data.edges;
    physics.alpha = 1.0;
    physics.running = true;

    // Fit after initial simulation settles
    setTimeout(() => {
      interaction.fitToView(nodes);
      requestDraw();
    }, 500);

    updateInfo();
    requestDraw();
  }

  window.addEventListener('resize', resizeCanvas);
  document.addEventListener('keydown', onKeyDown);

  // Initialize
  resizeCanvas();
  loadData();
  animate();

  // Store cleanup refs
  panelEl._cleanup = () => {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    interaction.destroy();
    window.removeEventListener('resize', resizeCanvas);
    document.removeEventListener('keydown', onKeyDown);
  };
}

export function closeGraphView() {
  if (!panelEl) return;
  panelEl._cleanup?.();
  panelEl.remove();
  panelEl = null;
}

export function isGraphViewOpen() {
  return panelEl !== null;
}

// Inject styles
injectStyles(`
  .graph-panel {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: var(--bg-primary);
    display: flex;
    flex-direction: column;
    animation: graph-fadein 0.2s ease;
  }

  @keyframes graph-fadein {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .graph-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border-color);
    background: var(--toolbar-bg);
    flex-shrink: 0;
  }

  .graph-title {
    font-family: var(--font-sans);
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
  }

  .graph-search {
    flex: 1;
    max-width: 260px;
    padding: 6px 10px;
    font-size: var(--font-size-sm);
    font-family: var(--font-sans);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-primary);
    color: var(--text-primary);
    outline: none;
    transition: border-color var(--transition-fast);
  }

  .graph-search:focus {
    border-color: var(--accent);
  }

  .graph-checkbox-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-sans);
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    cursor: pointer;
    white-space: nowrap;
  }

  .graph-checkbox-label input {
    accent-color: var(--accent);
    width: 14px;
    height: 14px;
  }

  .graph-toolbar-btn {
    padding: 6px 14px;
    font-family: var(--font-sans);
    font-size: var(--font-size-sm);
    font-weight: 500;
    background: var(--bg-hover);
    color: var(--text-primary);
    border-radius: var(--radius-sm);
    transition: background var(--transition-fast);
    white-space: nowrap;
  }

  .graph-toolbar-btn:hover {
    background: var(--bg-active);
  }

  .graph-close-btn {
    margin-left: auto;
    width: 32px;
    padding: 6px;
    text-align: center;
    font-size: 16px;
    line-height: 1;
  }

  .graph-canvas {
    flex: 1;
    width: 100%;
    cursor: grab;
  }

  .graph-canvas:active {
    cursor: grabbing;
  }

  .graph-info {
    padding: 6px 16px;
    font-family: var(--font-sans);
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    border-top: 1px solid var(--border-light);
    flex-shrink: 0;
  }

  @media (max-width: 767px) {
    .graph-toolbar {
      flex-wrap: wrap;
      gap: 8px;
    }

    .graph-search {
      max-width: none;
      order: 10;
      width: 100%;
    }

    .graph-checkbox-label {
      font-size: 12px;
    }
  }
`);
