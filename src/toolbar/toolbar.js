import { el } from '../utils/dom.js';
import { icons } from './toolbar-icons.js';
import { documentStore } from '../store/document-store.js';
import { eventBus } from '../store/event-bus.js';
import { settingsStore } from '../store/settings-store.js';
import { fileSaver } from '../save/file-saver.js';
import { editorZoom } from '../editor/editor-zoom.js';
import { downloadMarkdown, printDocument } from '../utils/export.js';
import { isTauri } from '../platform/tauri-bridge.js';

/**
 * gedit-style header bar: [Open] [+] ··· title ··· [Save] [☰] [window controls]
 */
export function createToolbar() {
  const iconBtn = (icon, label, onClick) => el('button', {
    className: 'header-btn header-icon-btn',
    title: label,
    'aria-label': label,
    unsafeHTML: icons[icon],
    onClick,
  });

  // --- Title: "*name" when dirty, directory as subtitle when known (Tauri paths) ---
  const titleEl = el('div', { className: 'header-title' });
  const subtitleEl = el('div', { className: 'header-subtitle' });

  function updateTitle() {
    const dirty = documentStore.isDirty() ? '*' : '';
    titleEl.textContent = dirty + documentStore.getFileName();
    const id = documentStore.getFileId() || '';
    const dir = /[\\/]/.test(id) ? id.replace(/[\\/][^\\/]*$/, '') : '';
    subtitleEl.textContent = dir;
    subtitleEl.hidden = !dir;
  }
  for (const evt of ['content:changed', 'file:saved', 'file:opened', 'file:new', 'file:renamed']) {
    eventBus.on(evt, updateTitle);
  }
  updateTitle();

  // --- Main menu (native popover: light dismiss + Esc for free) ---
  const menu = el('div', { className: 'app-menu', popover: 'auto' });
  const item = (label, shortcut, action) => el('button', {
    className: 'app-menu-item',
    onClick: () => { menu.hidePopover(); action(); },
  }, el('span', {}, label), shortcut ? el('kbd', {}, shortcut) : null);
  const sep = () => el('div', { className: 'app-menu-sep' });

  const themeRow = el('div', { className: 'app-menu-theme' });
  for (const [theme, icon] of [['light', 'sun'], ['dark', 'moon'], ['auto', 'monitor']]) {
    themeRow.appendChild(el('button', {
      title: `${theme[0].toUpperCase()}${theme.slice(1)} theme`,
      'aria-label': `${theme} theme`,
      dataset: { theme },
      unsafeHTML: icons[icon],
      onClick: () => settingsStore.set('theme', theme),
    }));
  }
  const syncTheme = () => themeRow.querySelectorAll('button').forEach(b =>
    b.classList.toggle('active', b.dataset.theme === settingsStore.getTheme()));
  eventBus.on('settings:theme', syncTheme);
  syncTheme();

  // Zoom row: [−] 100% [+], click the percentage to reset
  const zoomLabel = el('button', { title: 'Reset zoom (Ctrl+0)', onClick: () => editorZoom.reset() });
  const zoomRow = el('div', { className: 'app-menu-zoom' },
    el('button', { title: 'Zoom out (Ctrl+-)', 'aria-label': 'Zoom out', onClick: () => editorZoom.zoomOut() }, '−'),
    zoomLabel,
    el('button', { title: 'Zoom in (Ctrl++)', 'aria-label': 'Zoom in', onClick: () => editorZoom.zoomIn() }, '+'),
  );
  const syncZoom = () => { zoomLabel.textContent = `${Math.round(editorZoom.getZoom() * 100)}%`; };
  eventBus.on('settings:editorZoom', syncZoom);
  syncZoom();

  // Install App: only offered once the browser says the PWA is installable
  let installPrompt = null;
  const installItem = item('Install App…', '', async () => {
    installPrompt.prompt();
    if ((await installPrompt.userChoice).outcome === 'accepted') installItem.hidden = true;
  });
  installItem.hidden = true;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
    installItem.hidden = false;
  });
  window.addEventListener('appinstalled', () => { installItem.hidden = true; });

  menu.append(
    themeRow,
    zoomRow,
    sep(),
    item('New Tab', 'Ctrl+T', () => documentStore.newDocument()),
    item('Save As…', 'Shift+Ctrl+S', () => fileSaver.saveAs()),
    sep(),
    item('Find…', 'Ctrl+F', () => import('../find-replace/find-bar.js').then(m => m.openFindBar(false))),
    item('Find and Replace…', 'Ctrl+H', () => import('../find-replace/find-bar.js').then(m => m.openFindBar(true))),
    item('Source View', 'Ctrl+U', () => settingsStore.set('sourceMode', !settingsStore.get('sourceMode'))),
    item('History', 'Shift+Ctrl+H', () => import('../history/history-panel.js').then(m => m.openHistory())),
    sep(),
    item('Download .md', '', () => downloadMarkdown()),
    item('Export HTML…', '', () => import('../export/html-export.js').then(m => m.exportStyledHtml())),
    item('Print…', 'Ctrl+P', () => printDocument()),
    sep(),
    installItem,
    item('Keyboard Shortcuts', '', async () => {
      const [{ showInfo }, { buildAboutContent }] = await Promise.all([
        import('../ui/modal.js'), import('../ui/about-content.js'),
      ]);
      showInfo('mkdn', buildAboutContent());
    }),
  );
  document.body.appendChild(menu);

  const menuBtn = iconBtn('menu', 'Main menu', () => menu.togglePopover());
  // Anchor below the button (CSS anchor positioning isn't everywhere yet).
  menu.addEventListener('toggle', (e) => {
    if (e.newState !== 'open') return;
    const r = menuBtn.getBoundingClientRect();
    menu.style.top = `${r.bottom + 4}px`;
    menu.style.right = `${window.innerWidth - r.right}px`;
  });

  const header = el('header', { className: 'header-bar' },
    el('div', { className: 'header-start' },
      el('button', { className: 'header-btn', title: 'Open a file (Ctrl+O)', onClick: () => fileSaver.openFile() }, 'Open'),
      iconBtn('plus', 'New tab (Ctrl+T)', () => documentStore.newDocument()),
    ),
    el('div', { className: 'header-center' }, titleEl, subtitleEl),
    el('div', { className: 'header-end' },
      el('button', { className: 'header-btn', title: 'Save (Ctrl+S)', onClick: () => fileSaver.save() }, 'Save'),
      menuBtn,
      ...(isTauri() ? [createWindowControls()] : []),
    ),
  );

  if (isTauri()) initTauriChrome(header);
  return header;
}

// Tauri runs frameless (decorations: false): the header doubles as the title bar.
function createWindowControls() {
  const win = async () => (await import('@tauri-apps/api/window')).getCurrentWindow();
  const winBtn = (cls, label, svg, onClick) => el('button', {
    className: `window-control-btn ${cls}`,
    'aria-label': label,
    title: label,
    unsafeHTML: svg,
    onClick,
  });
  return el('div', { className: 'window-controls' },
    winBtn('minimize', 'Minimize',
      '<svg viewBox="0 0 12 12"><line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" stroke-width="1.2"/></svg>',
      async () => (await win()).minimize()),
    winBtn('maximize', 'Maximize',
      '<svg viewBox="0 0 12 12"><rect x="1.5" y="1.5" width="9" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
      async () => (await win()).toggleMaximize()),
    winBtn('close', 'Close',
      '<svg viewBox="0 0 12 12"><line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" stroke-width="1.2"/><line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" stroke-width="1.2"/></svg>',
      async () => (await win()).close()),
  );
}

function initTauriChrome(header) {
  const win = async () => (await import('@tauri-apps/api/window')).getCurrentWindow();
  const interactive = 'button, input, select, textarea, [popover], [contenteditable]';

  header.setAttribute('data-tauri-drag-region', '');
  // Programmatic drag — WebKitGTK can drop Tauri's automatic drag-region handling.
  header.addEventListener('mousedown', async (e) => {
    if (e.button !== 0 || e.target.closest(interactive)) return;
    (await win()).startDragging();
  });
  header.addEventListener('dblclick', async (e) => {
    if (e.target.closest(interactive)) return;
    (await win()).toggleMaximize();
  });

  // Frameless WebKitGTK windows get no resize edges from the WM: overlay thin handles.
  const edges = [
    ['n', 'ns-resize', 'North'], ['s', 'ns-resize', 'South'],
    ['e', 'ew-resize', 'East'], ['w', 'ew-resize', 'West'],
    ['ne', 'nesw-resize', 'NorthEast'], ['nw', 'nwse-resize', 'NorthWest'],
    ['se', 'nwse-resize', 'SouthEast'], ['sw', 'nesw-resize', 'SouthWest'],
  ];
  document.body.append(...edges.map(([cls, cursor, dir]) => el('div', {
    className: `tauri-resize-edge edge-${cls}`,
    style: { cursor },
    onMousedown: async (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      (await win()).startResizeDragging(dir);
    },
  })));
}
