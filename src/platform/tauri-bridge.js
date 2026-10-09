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

// Open files passed by the OS / CLI
export async function initTauriEvents() {
  if (!isTauri()) return;

  const { listen } = await import('@tauri-apps/api/event');

  // Open file from OS double-click / CLI while running (single-instance forward)
  const { localSync } = await import('../local/local-sync.js');
  const { localFs } = await import('../local/local-fs.js');
  const openPath = (path) => path && localSync.openHandle(localFs.handleForPath(path));
  await listen('file-open', ({ payload }) => openPath(payload));

  // File passed at launch — pulled now that the UI is ready (an emitted event could fire too early)
  const { invoke } = await import('@tauri-apps/api/core');
  openPath(await invoke('initial_file').catch(() => null));
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
