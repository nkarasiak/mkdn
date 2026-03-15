import { el, injectStyles } from '../utils/dom.js';
import { toast } from '../ui/toast.js';
import { eventBus } from '../store/event-bus.js';
import { documentStore } from '../store/document-store.js';

let deferredInstallPrompt = null;
let installBannerEl = null;

/**
 * Initialize PWA features: install prompt, offline detection, file handler.
 */
export function initPWA() {
  // Capture the beforeinstallprompt event
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    showInstallBanner();
  });

  // Listen for successful install
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    hideInstallBanner();
    toast('MKDN installed successfully!', 'success');
  });

  // Offline/online detection
  window.addEventListener('offline', () => {
    document.body.classList.add('is-offline');
    toast('You are offline. Changes are saved locally.', 'warning', 5000);
  });

  window.addEventListener('online', () => {
    document.body.classList.remove('is-offline');
    toast('Back online', 'success', 2000);
  });

  if (!navigator.onLine) {
    document.body.classList.add('is-offline');
  }

  // Handle files opened via the PWA file handler (launch queue API)
  if ('launchQueue' in window) {
    window.launchQueue.setConsumer(async (launchParams) => {
      if (!launchParams.files?.length) return;
      for (const fileHandle of launchParams.files) {
        try {
          const file = await fileHandle.getFile();
          const content = await file.text();
          documentStore.setFile(file.name, file.name, content, 'launch-handler');
          toast(`Opened ${file.name}`, 'success');
        } catch {
          toast('Failed to open file', 'error');
        }
      }
    });
  }

  // Service worker update notification
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then((registration) => {
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner();
          }
        });
      });
    });
  }
}

function showInstallBanner() {
  if (installBannerEl) return;
  // Don't show if already installed as PWA
  if (window.matchMedia('(display-mode: standalone)').matches) return;

  installBannerEl = el('div', { className: 'pwa-install-banner' },
    el('div', { className: 'pwa-install-content' },
      el('span', { className: 'pwa-install-text' }, 'Install MKDN for offline use'),
      el('button', {
        className: 'pwa-install-btn',
        onClick: async () => {
          if (!deferredInstallPrompt) return;
          deferredInstallPrompt.prompt();
          const { outcome } = await deferredInstallPrompt.userChoice;
          if (outcome === 'accepted') {
            deferredInstallPrompt = null;
          }
          hideInstallBanner();
        },
      }, 'Install'),
      el('button', {
        className: 'pwa-install-dismiss',
        onClick: () => {
          hideInstallBanner();
          // Don't show again this session
          sessionStorage.setItem('mkdn-install-dismissed', '1');
        },
      }, '\u2715'),
    ),
  );

  // Don't show if dismissed this session
  if (sessionStorage.getItem('mkdn-install-dismissed')) return;

  document.body.appendChild(installBannerEl);
  requestAnimationFrame(() => installBannerEl.classList.add('visible'));
}

function hideInstallBanner() {
  if (!installBannerEl) return;
  installBannerEl.classList.remove('visible');
  setTimeout(() => {
    installBannerEl?.remove();
    installBannerEl = null;
  }, 300);
}

function showUpdateBanner() {
  const banner = el('div', { className: 'pwa-update-banner' },
    el('span', {}, 'A new version of MKDN is available.'),
    el('button', {
      className: 'pwa-install-btn',
      onClick: () => {
        banner.remove();
        window.location.reload();
      },
    }, 'Update'),
    el('button', {
      className: 'pwa-install-dismiss',
      onClick: () => banner.remove(),
    }, '\u2715'),
  );
  document.body.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add('visible'));
}

// Inject PWA styles
injectStyles(`
.pwa-install-banner,
.pwa-update-banner {
  position: fixed;
  bottom: 60px;
  left: 50%;
  transform: translateX(-50%) translateY(20px);
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 10px 16px;
  z-index: 500;
  opacity: 0;
  transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  pointer-events: none;
}

.pwa-install-banner.visible,
.pwa-update-banner.visible {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
  pointer-events: auto;
}

.pwa-install-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.pwa-update-banner {
  display: flex;
  align-items: center;
  gap: 12px;
}

.pwa-install-text {
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  white-space: nowrap;
}

.pwa-update-banner > span {
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  color: var(--text-primary);
}

.pwa-install-btn {
  padding: 5px 14px;
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  font-weight: 600;
  background: var(--accent);
  color: var(--accent-text);
  border-radius: var(--radius-sm);
  transition: background var(--transition-fast);
  white-space: nowrap;
  cursor: pointer;
}

.pwa-install-btn:hover {
  background: var(--accent-hover);
}

.pwa-install-dismiss {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-size: 14px;
  transition: background var(--transition-fast);
  cursor: pointer;
}

.pwa-install-dismiss:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

/* Offline indicator */
body.is-offline .toolbar-header::after {
  content: 'Offline';
  position: absolute;
  right: 50%;
  transform: translateX(50%);
  font-family: var(--font-sans);
  font-size: 10px;
  font-weight: 600;
  color: var(--warning);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  pointer-events: none;
}

@media (max-width: 767px) {
  .pwa-install-banner,
  .pwa-update-banner {
    left: 16px;
    right: 16px;
    transform: translateX(0) translateY(20px);
    bottom: 60px;
  }

  .pwa-install-banner.visible,
  .pwa-update-banner.visible {
    transform: translateX(0) translateY(0);
  }
}
`);
