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

  // Patch localFs with native Tauri file operations
  const { patchLocalFs } = await import('./tauri-fs.js');
  patchLocalFs();

  // Check for updates silently on startup (after a short delay)
  setTimeout(() => checkForUpdates(true), 3000);
}

// Listen for native menu events and file-open from CLI/OS
export async function initTauriEvents({ toggleSidebar, fileSaver, documentStore, focusManager, settingsStore }) {
  if (!isTauri()) return;

  const { listen } = await import('@tauri-apps/api/event');

  // Native menu → JS actions
  await listen('menu-event', ({ payload: id }) => {
    switch (id) {
      case 'file:new': documentStore.newDocument(); break;
      case 'file:open': fileSaver.openFile(); break;
      case 'file:save': fileSaver.save(); break;
      case 'file:save-as': fileSaver.saveAs(); break;
      case 'view:toggle-sidebar': toggleSidebar(); break;
      case 'view:toggle-source': settingsStore.set('sourceMode', !settingsStore.get('sourceMode')); break;
      case 'view:zen-mode': focusManager.cycleMode(); break;
      case 'tools:command-palette':
        import('../command-palette/command-palette.js').then(m => m.openCommandPalette());
        break;
      case 'tools:writing-stats':
        import('../stats/writing-stats.js').then(m => m.openWritingStats());
        break;
      case 'tools:theme-editor':
        import('../themes/theme-editor.js').then(m => m.openThemeEditor());
        break;
      case 'tools:templates':
        import('../templates/template-system.js').then(m => m.openTemplateChooser());
        break;
      case 'help:shortcuts': showShortcutsDialog(); break;
      case 'help:about': showAboutDialog(); break;
      case 'help:check-updates': checkForUpdates(); break;
    }
  });

  // Open file from CLI args or OS double-click
  await listen('file-open', async ({ payload: path }) => {
    try {
      const { readTextFile } = await import('@tauri-apps/plugin-fs');
      const content = await readTextFile(path);
      const name = path.split('/').pop().split('\\').pop();
      documentStore.setFile(path, name, content, 'local');
    } catch (err) {
      console.error('[tauri] Failed to open file:', err);
    }
  });
}

// --- Help dialogs ---

const SHORTCUTS = [
  ['File', [
    ['Ctrl+N', 'New Document'],
    ['Ctrl+O', 'Open File'],
    ['Ctrl+S', 'Save'],
    ['Ctrl+Shift+S', 'Save As'],
  ]],
  ['Edit', [
    ['Ctrl+Z', 'Undo'],
    ['Ctrl+Shift+Z', 'Redo'],
    ['Ctrl+F', 'Find'],
    ['Ctrl+H', 'Find & Replace'],
  ]],
  ['Format', [
    ['Ctrl+B', 'Bold'],
    ['Ctrl+I', 'Italic'],
    ['Ctrl+E', 'Inline Code'],
    ['Ctrl+L', 'Insert Link'],
  ]],
  ['View', [
    ['Ctrl+Shift+B', 'Toggle Sidebar'],
    ['Ctrl+Shift+H', 'Toggle History'],
    ['Ctrl+U', 'Source Mode'],
    ['Ctrl+Shift+F', 'Cycle Focus Modes'],
    ['Ctrl+Shift+G', 'Knowledge Graph'],
  ]],
  ['Tools', [
    ['Ctrl+K', 'Command Palette'],
    ['Ctrl+P', 'Print / Export PDF'],
    ['Escape', 'Close Panel / Exit Mode'],
  ]],
];

function showShortcutsDialog() {
  import('../utils/dom.js').then(({ el }) => {
    import('../ui/modal.js').then(({ showInfo }) => {
      const container = el('div', { className: 'about-content' });
      for (const [section, keys] of SHORTCUTS) {
        container.appendChild(el('div', { className: 'about-section-title' }, section));
        const table = el('table', { className: 'about-shortcuts' });
        for (const [shortcut, desc] of keys) {
          const kbd = shortcut.split('+').map(k => `<kbd>${k}</kbd>`).join('');
          const row = el('tr', {},
            el('td', { className: 'about-shortcut-keys', unsafeHTML: kbd }),
            el('td', {}, desc),
          );
          table.appendChild(row);
        }
        container.appendChild(table);
      }
      showInfo('Keyboard Shortcuts', container);
    });
  });
}

function showAboutDialog() {
  import('../utils/dom.js').then(({ el }) => {
    import('../ui/modal.js').then(({ showInfo }) => {
      const version = __APP_VERSION__ || '?';
      const container = el('div', { className: 'about-content' },
        el('div', { className: 'about-description' },
          'A minimal, beautiful markdown editor with real-time collaboration, local folder sync, version history, and a plugin system.'
        ),
        el('div', { className: 'about-section-title' }, 'Links'),
        el('div', {},
          el('a', { className: 'about-link', href: 'https://github.com/nkarasiak/mkdn', target: '_blank' }, 'GitHub Repository'),
        ),
        el('div', {},
          el('a', { className: 'about-link', href: 'https://github.com/nkarasiak/mkdn/releases', target: '_blank' }, 'Releases & Changelog'),
        ),
        el('div', { className: 'about-version' }, `MKDN v${version}`),
      );
      showInfo('About MKDN', container);
    });
  });
}

// --- Auto-updater ---

async function checkForUpdates(silent = false) {
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();

    if (!update) {
      if (!silent) {
        const { showInfo } = await import('../ui/modal.js');
        showInfo('Up to Date', `You're running the latest version (v${__APP_VERSION__}).`);
      }
      return;
    }

    // Update available — show confirmation dialog
    const { confirm } = await import('../ui/modal.js');
    const { el } = await import('../utils/dom.js');

    const body = el('div', { className: 'about-content' },
      el('div', { className: 'about-description' },
        `A new version of MKDN is available: v${update.version}`
      ),
      update.body ? el('div', { style: { marginTop: '8px', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', maxHeight: '200px', overflowY: 'auto', whiteSpace: 'pre-wrap' } }, update.body) : null,
      el('div', { className: 'about-version' }, `Current: v${__APP_VERSION__}`),
    );
    // Remove null children
    for (const child of [...body.childNodes]) {
      if (!child) body.removeChild(child);
    }

    const ok = await confirm(body, {
      title: 'Update Available',
      okText: 'Download & Install',
      cancelText: 'Later',
    });
    if (!ok) return;

    // Show progress via toast
    const { toast: showToast } = await import('../ui/toast.js');
    const dismissDownloading = showToast('Downloading update...', 'info', 0);

    await update.downloadAndInstall((event) => {
      if (event.event === 'Finished') {
        dismissDownloading();
        showToast('Update ready — restart to apply.', 'success', 5000);
      }
    });
  } catch (err) {
    console.warn('[tauri] Update check failed:', err);
    if (!silent) {
      // Network error or missing release manifest (404) — not a real error for the user
      const errMsg = String(err?.message || err || '');
      const isNetworkIssue = errMsg.includes('404') || errMsg.includes('network') ||
        errMsg.includes('fetch') || errMsg.includes('Could not') || errMsg.includes('status');
      if (isNetworkIssue) {
        const { showInfo } = await import('../ui/modal.js');
        showInfo('Up to Date', `You're running the latest version (v${__APP_VERSION__}). No updates are available yet.`);
      } else {
        const { toast: showToast } = await import('../ui/toast.js');
        showToast('Failed to check for updates', 'error');
      }
    }
  }
}
