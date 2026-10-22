// Tauri v2 desktop integration
// Runtime detection, native file I/O patching, and updates

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

// Re-open an absolute-path file from disk (session restore of files opened via OS/CLI)
export async function restoreTauriFile(fileId) {
  if (!isTauri()) return false;
  if (!fileId || (!fileId.startsWith('/') && !fileId.includes('\\'))) return false;
  try {
    const { fileSaver } = await import('../save/file-saver.js');
    await fileSaver.openHandle(fileId);
    return true;
  } catch {
    return false;
  }
}

// Open file from CLI args or OS double-click
export async function initTauriEvents() {
  if (!isTauri()) return;
  const { listen } = await import('@tauri-apps/api/event');
  await listen('file-open', async ({ payload: path }) => {
    try {
      const { fileSaver } = await import('../save/file-saver.js');
      await fileSaver.openHandle(path);
    } catch (err) {
      console.error('[tauri] Failed to open file:', err);
    }
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
