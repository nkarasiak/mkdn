// Tauri v2 desktop integration
// Runtime detection, custom window chrome, and native file I/O patching

let _isTauri = null;

export function isTauri() {
  if (_isTauri === null) {
    _isTauri = '__TAURI_INTERNALS__' in window;
  }
  return _isTauri;
}

export async function initTauri() {
  if (!isTauri()) return;

  document.documentElement.classList.add('is-tauri');

  // Custom window controls (frameless window)
  await initWindowControls();

  // Patch localFs with native Tauri file operations
  const { patchLocalFs } = await import('./tauri-fs.js');
  patchLocalFs();
}

// --- Window controls ---

const MINIMIZE_SVG = `<svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor"/></svg>`;
const MAXIMIZE_SVG = `<svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1"/></svg>`;
const RESTORE_SVG = `<svg width="10" height="10" viewBox="0 0 10 10"><rect x="2.5" y="0.5" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1"/><rect x="0.5" y="2.5" width="7" height="7" rx="1" fill="var(--toolbar-bg)" stroke="currentColor" stroke-width="1"/></svg>`;
const CLOSE_SVG = `<svg width="10" height="10" viewBox="0 0 10 10"><line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" stroke-width="1.2"/><line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" stroke-width="1.2"/></svg>`;

async function initWindowControls() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const appWindow = getCurrentWindow();

  // Make toolbar header the drag region
  const header = document.querySelector('.toolbar-header');
  if (!header) return;

  header.setAttribute('data-tauri-drag-region', '');
  // Child containers should also be drag regions (empty space between buttons)
  for (const child of header.querySelectorAll('.toolbar-header-left, .toolbar-header-right')) {
    child.setAttribute('data-tauri-drag-region', '');
  }

  // Create window control buttons
  const controls = document.createElement('div');
  controls.className = 'window-controls';

  const minimizeBtn = controlBtn('minimize', MINIMIZE_SVG, () => appWindow.minimize());
  const maximizeBtn = controlBtn('maximize', MAXIMIZE_SVG, () => appWindow.toggleMaximize());
  const closeBtn = controlBtn('close', CLOSE_SVG, () => appWindow.close());

  controls.append(minimizeBtn, maximizeBtn, closeBtn);
  header.appendChild(controls);

  // Update maximize/restore icon on resize
  appWindow.onResized(async () => {
    const isMax = await appWindow.isMaximized();
    maximizeBtn.innerHTML = isMax ? RESTORE_SVG : MAXIMIZE_SVG;
    maximizeBtn.setAttribute('aria-label', isMax ? 'Restore' : 'Maximize');
  });

  // Note: double-click to maximize is handled natively by data-tauri-drag-region
}

function controlBtn(type, svg, onClick) {
  const btn = document.createElement('button');
  btn.className = `window-control window-control-${type}`;
  btn.setAttribute('aria-label', type.charAt(0).toUpperCase() + type.slice(1));
  btn.innerHTML = svg;
  btn.addEventListener('click', onClick);
  return btn;
}
