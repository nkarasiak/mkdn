/**
 * Canvas / Whiteboard mode.
 * Full-screen overlay where users can place note cards, text labels,
 * and connection arrows on a freeform canvas.
 */

import { el, injectStyles } from '../utils/dom.js';
import { localSync } from '../local/local-sync.js';
import { toast } from '../ui/toast.js';
import { CanvasRenderer } from './canvas-renderer.js';
import { CanvasInteraction } from './canvas-interaction.js';
import {
  createCanvasData, saveCanvas, loadCanvas, listCanvases,
  deleteCanvas, importCanvas, createAutoSave,
} from './canvas-data.js';

let panelEl = null;
let animFrameId = null;

export function openCanvasMode(canvasName) {
  if (panelEl) {
    closeCanvasMode();
    return;
  }

  // State
  let data = createCanvasData();
  let currentName = canvasName || null;

  // If a name was given, try loading it
  if (currentName) {
    const loaded = loadCanvas(currentName);
    if (loaded) data = loaded;
  }

  // Expose localSync for file linking in interaction module
  window.__mkdn_localSync = localSync;

  // --- Canvas & renderer ---
  const canvas = el('canvas', { className: 'canvas-whiteboard' });
  const renderer = new CanvasRenderer(canvas);

  let drawRequested = true;
  function requestDraw() { drawRequested = true; }

  const autoSave = createAutoSave(() => currentName, () => data);

  const interaction = new CanvasInteraction(canvas, renderer, {
    getData: () => data,
    setData: (d) => { data = d; },
    requestDraw,
    onOpenFile: (fileName) => {
      if (localSync.isLinked()) {
        closeCanvasMode();
        localSync.open(fileName);
      } else {
        toast('Link a folder to open linked files', 'info');
      }
    },
    onCanvasChanged: () => {
      autoSave();
      updateInfo();
    },
  });

  // --- Toolbar ---
  function createModeBtn(label, mode) {
    const btn = el('button', {
      className: 'canvas-toolbar-btn',
      onClick: () => {
        interaction.mode = mode;
        updateModeButtons();
        canvas.style.cursor = mode === 'select' ? 'grab' : 'crosshair';
      },
    }, label);
    btn.dataset.mode = mode;
    return btn;
  }

  const modeBtns = [
    createModeBtn('Select', 'select'),
    createModeBtn('+ Card', 'addCard'),
    createModeBtn('+ Text', 'addText'),
    createModeBtn('+ Arrow', 'addConnection'),
  ];

  function updateModeButtons() {
    for (const btn of modeBtns) {
      btn.classList.toggle('canvas-toolbar-btn--active', btn.dataset.mode === interaction.mode);
    }
  }
  updateModeButtons();

  const zoomInBtn = el('button', {
    className: 'canvas-toolbar-btn',
    onClick: () => {
      interaction.zoom = Math.min(4, interaction.zoom * 1.25);
      requestDraw();
    },
  }, '+');

  const zoomOutBtn = el('button', {
    className: 'canvas-toolbar-btn',
    onClick: () => {
      interaction.zoom = Math.max(0.15, interaction.zoom / 1.25);
      requestDraw();
    },
  }, '\u2212');

  const fitBtn = el('button', {
    className: 'canvas-toolbar-btn',
    onClick: () => interaction.fitToView(),
  }, 'Fit');

  // Canvas name input
  const nameInput = el('input', {
    type: 'text',
    className: 'canvas-name-input',
    placeholder: 'Canvas name...',
    value: currentName || '',
    onChange: (e) => {
      const newName = e.target.value.trim();
      if (newName && newName !== currentName) {
        if (currentName) deleteCanvas(currentName);
        currentName = newName;
        saveCanvas(currentName, data);
        toast(`Canvas saved as "${currentName}"`, 'success');
      }
    },
  });

  const saveBtn = el('button', {
    className: 'canvas-toolbar-btn',
    onClick: () => {
      if (!currentName) {
        const name = prompt('Canvas name:');
        if (!name) return;
        currentName = name.trim();
        nameInput.value = currentName;
      }
      saveCanvas(currentName, data);
      toast(`Canvas "${currentName}" saved`, 'success');
    },
  }, 'Save');

  const loadBtn = el('button', {
    className: 'canvas-toolbar-btn',
    onClick: () => {
      const names = listCanvases();
      if (names.length === 0) {
        toast('No saved canvases', 'info');
        return;
      }
      const choice = prompt(`Open canvas:\n\n${names.join('\n')}`);
      if (!choice) return;
      const loaded = loadCanvas(choice.trim());
      if (loaded) {
        data = loaded;
        currentName = choice.trim();
        nameInput.value = currentName;
        interaction.selectedIds.clear();
        requestDraw();
        updateInfo();
        setTimeout(() => interaction.fitToView(), 50);
        toast(`Opened "${currentName}"`, 'success');
      } else {
        toast(`Canvas "${choice}" not found`, 'error');
      }
    },
  }, 'Open');

  const exportBtn = el('button', {
    className: 'canvas-toolbar-btn',
    onClick: () => {
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (currentName || 'canvas') + '.json';
      a.click();
      URL.revokeObjectURL(url);
    },
  }, 'Export');

  const importBtn = el('button', {
    className: 'canvas-toolbar-btn',
    onClick: () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.addEventListener('change', () => {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const imported = importCanvas(reader.result);
          if (imported) {
            data = imported;
            currentName = imported.name || file.name.replace(/\.json$/, '');
            nameInput.value = currentName;
            interaction.selectedIds.clear();
            requestDraw();
            updateInfo();
            setTimeout(() => interaction.fitToView(), 50);
            toast(`Imported "${currentName}"`, 'success');
          } else {
            toast('Invalid canvas file', 'error');
          }
        };
        reader.readAsText(file);
      });
      input.click();
    },
  }, 'Import');

  const closeBtn = el('button', {
    className: 'canvas-toolbar-btn canvas-close-btn',
    onClick: closeCanvasMode,
  }, '\u2715');

  const infoBar = el('div', { className: 'canvas-info' }, '');

  function updateInfo() {
    const nodeCount = data.nodes.length;
    const edgeCount = data.edges.length;
    const selCount = interaction.selectedIds.size;
    const zoomPct = Math.round(interaction.zoom * 100);
    infoBar.textContent = `${nodeCount} node${nodeCount !== 1 ? 's' : ''} \u00b7 ${edgeCount} edge${edgeCount !== 1 ? 's' : ''}${selCount > 0 ? ` \u00b7 ${selCount} selected` : ''} \u00b7 ${zoomPct}%`;
  }

  const toolbar = el('div', { className: 'canvas-toolbar' },
    el('span', { className: 'canvas-title' }, 'Canvas'),
    nameInput,
    el('div', { className: 'canvas-toolbar-group' }, ...modeBtns),
    el('div', { className: 'canvas-toolbar-group' }, zoomOutBtn, zoomInBtn, fitBtn),
    el('div', { className: 'canvas-toolbar-group' }, saveBtn, loadBtn, exportBtn, importBtn),
    closeBtn,
  );

  panelEl = el('div', { className: 'canvas-panel' }, toolbar, canvas, infoBar);
  document.body.appendChild(panelEl);

  // --- Resize ---
  function resizeCanvas() {
    renderer.resize();
    requestDraw();
  }

  // --- Animation loop ---
  function animate() {
    if (drawRequested) {
      renderer.draw(data, {
        offsetX: interaction.offsetX,
        offsetY: interaction.offsetY,
        zoom: interaction.zoom,
        selectedIds: interaction.selectedIds,
        hoveredId: interaction.hoveredId,
        mode: interaction.mode,
        connectingFrom: interaction.connectingFrom,
      });
      drawRequested = false;
      updateInfo();
    }
    animFrameId = requestAnimationFrame(animate);
  }

  // Escape to close (when nothing is selected)
  function onKeyDown(e) {
    if (e.key === 'Escape' && interaction.selectedIds.size === 0 && !interaction.connectingFrom) {
      closeCanvasMode();
      e.preventDefault();
    }
  }

  window.addEventListener('resize', resizeCanvas);
  document.addEventListener('keydown', onKeyDown);

  resizeCanvas();
  animate();

  // Center view
  if (data.nodes.length > 0) {
    setTimeout(() => interaction.fitToView(), 50);
  } else {
    const dpr = window.devicePixelRatio || 1;
    interaction.offsetX = (canvas.width / dpr) / 2;
    interaction.offsetY = (canvas.height / dpr) / 2;
    requestDraw();
  }

  panelEl._cleanup = () => {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    interaction.destroy();
    window.removeEventListener('resize', resizeCanvas);
    document.removeEventListener('keydown', onKeyDown);
    delete window.__mkdn_localSync;
  };
}

export function closeCanvasMode() {
  if (!panelEl) return;
  panelEl._cleanup?.();
  panelEl.remove();
  panelEl = null;
}

export function isCanvasModeOpen() {
  return panelEl !== null;
}

// --- Styles ---
injectStyles(`
  .canvas-panel {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: var(--bg-primary);
    display: flex;
    flex-direction: column;
    animation: canvas-fadein 0.2s ease;
  }

  @keyframes canvas-fadein {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .canvas-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border-color);
    background: var(--toolbar-bg);
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .canvas-title {
    font-family: var(--font-sans);
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
  }

  .canvas-name-input {
    width: 140px;
    padding: 5px 8px;
    font-size: var(--font-size-sm);
    font-family: var(--font-sans);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-primary);
    color: var(--text-primary);
    outline: none;
    transition: border-color var(--transition-fast);
  }

  .canvas-name-input:focus {
    border-color: var(--accent);
  }

  .canvas-toolbar-group {
    display: flex;
    gap: 2px;
    background: var(--bg-primary);
    border-radius: var(--radius-sm);
    padding: 2px;
  }

  .canvas-toolbar-btn {
    padding: 5px 10px;
    font-family: var(--font-sans);
    font-size: var(--font-size-sm);
    font-weight: 500;
    background: var(--bg-hover);
    color: var(--text-primary);
    border-radius: var(--radius-sm);
    transition: background var(--transition-fast);
    white-space: nowrap;
    cursor: pointer;
    border: none;
  }

  .canvas-toolbar-btn:hover {
    background: var(--bg-active);
  }

  .canvas-toolbar-btn--active {
    background: var(--accent);
    color: #fff;
  }

  .canvas-toolbar-btn--active:hover {
    background: var(--accent);
    opacity: 0.9;
  }

  .canvas-close-btn {
    margin-left: auto;
    width: 32px;
    padding: 5px;
    text-align: center;
    font-size: 16px;
    line-height: 1;
  }

  .canvas-whiteboard {
    flex: 1;
    width: 100%;
    cursor: grab;
    display: block;
  }

  .canvas-info {
    padding: 5px 12px;
    font-family: var(--font-sans);
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    border-top: 1px solid var(--border-light);
    flex-shrink: 0;
  }

  /* Context menu */
  .canvas-context-menu {
    position: fixed;
    z-index: 1100;
    min-width: 160px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    box-shadow: 0 4px 16px rgba(0,0,0,0.15);
    padding: 4px 0;
    font-family: var(--font-sans);
    font-size: var(--font-size-sm);
  }

  .canvas-ctx-item {
    padding: 6px 14px;
    color: var(--text-primary);
    cursor: pointer;
    position: relative;
  }

  .canvas-ctx-item:hover {
    background: var(--bg-hover);
  }

  .canvas-ctx-separator {
    height: 1px;
    background: var(--border-light);
    margin: 4px 0;
  }

  .canvas-ctx-submenu {
    position: relative;
  }

  .canvas-ctx-submenu-panel {
    display: none;
    position: absolute;
    left: 100%;
    top: 0;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    box-shadow: 0 4px 16px rgba(0,0,0,0.15);
    padding: 8px;
    gap: 4px;
    flex-wrap: wrap;
    width: 160px;
  }

  .canvas-ctx-submenu:hover .canvas-ctx-submenu-panel {
    display: flex;
  }

  .canvas-ctx-color-item {
    width: 28px;
    height: 28px;
    border-radius: 4px;
    border: 1px solid var(--border-color);
    cursor: pointer;
    transition: transform 0.1s;
  }

  .canvas-ctx-color-item:hover {
    transform: scale(1.15);
    border-color: var(--accent);
  }

  @media (max-width: 767px) {
    .canvas-toolbar {
      gap: 4px;
      padding: 6px 8px;
    }

    .canvas-name-input {
      width: 100px;
    }

    .canvas-toolbar-btn {
      padding: 4px 6px;
      font-size: 12px;
    }
  }
`);
