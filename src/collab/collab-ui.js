import { el, injectStyles } from '../utils/dom.js';
import { collabManager, getSavedSession, getUserName } from './collab-manager.js';
import { eventBus } from '../store/event-bus.js';
import { toast } from '../ui/toast.js';
import { settingsStore } from '../store/settings-store.js';
let peerIndicator = null;
let dialogOverlay = null;

function closeSetupDialog() {
  if (dialogOverlay) {
    dialogOverlay.remove();
    dialogOverlay = null;
  }
}

export function createCollabUI() {
  // Inject styles
  injectStyles(`
    .collab-peers {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-right: 8px;
    }
    .collab-peer-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
      border: 1px solid rgba(255,255,255,0.2);
    }
    .collab-peer-count {
      font-size: 12px;
      color: var(--text-secondary);
      margin-left: 2px;
    }
    .collab-active-badge {
      font-size: 11px;
      background: #4ECDC4;
      color: #000;
      padding: 2px 8px;
      border-radius: 10px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      font-family: var(--font-sans);
    }
    .collab-active-badge:hover {
      opacity: 0.9;
    }
    .collab-dialog {
      background: var(--bg-primary);
      border-radius: 12px;
      padding: 24px;
      width: 400px;
      max-width: 90vw;
      display: flex;
      flex-direction: column;
      gap: 12px;
      color: var(--text-primary);
      font-family: var(--font-sans);
    }
    .collab-dialog h3 { margin: 0 0 8px; font-size: 18px; }
    .collab-dialog label { font-size: 13px; font-weight: 500; color: var(--text-secondary); }
    .collab-dialog input {
      padding: 8px 12px;
      border: 1px solid var(--border-color);
      border-radius: var(--radius);
      background: var(--bg-primary);
      color: var(--text-primary);
      font-size: 14px;
      font-family: var(--font-sans);
    }
    .collab-share-url {
      padding: 8px 12px;
      background: var(--bg-secondary, var(--bg-primary));
      border: 1px solid var(--border-color);
      border-radius: var(--radius);
      font-size: 13px;
      word-break: break-all;
      cursor: pointer;
      user-select: all;
    }
    .collab-share-url:hover { background: var(--bg-hover); }
    .collab-peer-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .collab-peer-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
    }
    .collab-settings-hint {
      font-size: 12px;
      color: var(--text-secondary);
    }
    .collab-server-warning {
      font-size: 12px;
      color: #e67e22;
      padding: 8px 12px;
      background: rgba(230, 126, 34, 0.1);
      border-radius: var(--radius);
    }
    .collab-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 8px;
    }
    .collab-btn-primary {
      padding: 8px 20px;
      background: var(--accent);
      color: white;
      border: none;
      border-radius: var(--radius);
      cursor: pointer;
      font-size: 14px;
      font-family: var(--font-sans);
    }
    .collab-btn-secondary {
      padding: 8px 20px;
      background: transparent;
      color: var(--text-primary);
      border: 1px solid var(--border-color);
      border-radius: var(--radius);
      cursor: pointer;
      font-size: 14px;
      font-family: var(--font-sans);
    }
    .collab-btn-danger {
      padding: 8px 20px;
      background: #e74c3c;
      color: white;
      border: none;
      border-radius: var(--radius);
      cursor: pointer;
      font-size: 14px;
      font-family: var(--font-sans);
    }
    /* Y.js cursor styles */
    .yRemoteSelection {
      opacity: 0.3;
    }
    .yRemoteSelectionHead {
      position: absolute;
      border-left: 2px solid;
      border-color: inherit;
      height: 100%;
    }
    .yRemoteSelectionHead::after {
      content: attr(data-name);
      position: absolute;
      top: -1.4em;
      left: -1px;
      font-size: 11px;
      padding: 1px 6px;
      border-radius: 3px 3px 3px 0;
      white-space: nowrap;
      font-family: var(--font-sans);
      color: #fff;
      background: inherit;
      background-color: inherit;
    }
  `);
}

export function createPeerIndicator() {
  peerIndicator = el('div', { className: 'collab-peers', style: { display: 'none' } });

  eventBus.on('collab:peers-changed', ({ peers }) => {
    updatePeerIndicator(peers);
  });

  eventBus.on('collab:started', () => {
    peerIndicator.style.display = 'flex';
    updatePeerIndicator([]);
  });

  eventBus.on('collab:stopped', () => {
    peerIndicator.style.display = 'none';
  });

  return peerIndicator;
}

function updatePeerIndicator(peers) {
  peerIndicator.replaceChildren();

  // Show colored dots for each peer
  for (const peer of peers.slice(0, 5)) {
    peerIndicator.appendChild(el('span', {
      className: 'collab-peer-dot',
      title: peer.name,
      style: { backgroundColor: peer.color },
    }));
  }

  const total = peers.length + 1; // +1 for self
  peerIndicator.appendChild(el('span', { className: 'collab-peer-count' }, `${total}`));
}

export async function openCollabDialog() {
  if (collabManager.isActive()) {
    // Already live — just re-copy the URL
    const url = collabManager.getShareUrl();
    if (url) {
      history.replaceState(null, '', url.slice(url.indexOf('#')));
      navigator.clipboard.writeText(url).then(() => {
        toast('Share URL copied!', 'success');
      }).catch(() => {});
    }
    return;
  }

  const serverUrl = settingsStore.get('collabServerUrl');

  // No server URL configured — show setup dialog
  if (!serverUrl) {
    showServerSetupDialog();
    return;
  }

  // Start session immediately
  const name = getUserName();
  collabManager.setUserName(name);
  await collabManager.startSession();

  // Put collab URL in address bar and copy to clipboard
  const url = collabManager.getShareUrl();
  if (url) {
    history.replaceState(null, '', url.slice(url.indexOf('#')));
    navigator.clipboard.writeText(url).then(() => {
      toast('Share URL copied!', 'success');
    }).catch(() => {});
  }
}

function showServerSetupDialog() {
  const currentUrl = settingsStore.get('collabServerUrl') || '';

  const urlInput = el('input', {
    type: 'text',
    placeholder: 'https://my-project.username.partykit.dev',
    value: currentUrl,
    style: { width: '100%', boxSizing: 'border-box' },
  });

  const warning = el('div', { className: 'collab-server-warning' },
    'A PartyKit server URL is required for collaboration. Deploy the included party/server.js with "npx partykit deploy" and paste the URL here.'
  );

  const dialog = el('div', { className: 'collab-dialog' },
    el('h3', {}, 'Collaboration Server'),
    warning,
    el('label', {}, 'PartyKit Server URL'),
    urlInput,
    el('div', { className: 'collab-settings-hint' },
      'This URL is saved in your settings. You only need to set it once.'
    ),
    el('div', { className: 'collab-actions' },
      el('button', {
        className: 'collab-btn-secondary',
        onclick: () => closeSetupDialog(),
      }, 'Cancel'),
      el('button', {
        className: 'collab-btn-primary',
        onclick: async () => {
          const url = urlInput.value.trim();
          if (!url) {
            toast('Please enter a server URL', 'warning');
            return;
          }
          settingsStore.set('collabServerUrl', url);
          closeSetupDialog();
          toast('Server URL saved', 'success');
          // Now start the session
          await openCollabDialog();
        },
      }, 'Save & Start'),
    ),
  );

  dialogOverlay = el('div', {
    className: 'modal-overlay modal-open',
    onclick: (e) => { if (e.target === dialogOverlay) closeSetupDialog(); },
  }, dialog);
  document.body.appendChild(dialogOverlay);
  urlInput.focus();
}

// Check URL for collaboration room on load
export function checkUrlForCollabRoom() {
  const hash = window.location.hash;
  if (hash.startsWith('#s=')) {
    const token = hash.slice(3);
    const dotIdx = token.indexOf('.');
    const room = dotIdx > 0 ? token.slice(0, dotIdx) : token;
    const key = dotIdx > 0 ? token.slice(dotIdx + 1) : null;
    if (room) {
      setTimeout(async () => {
        const name = getUserName();
        collabManager.setUserName(name);
        await collabManager.startSession(room, key);
      }, 1500);
    }
    return;
  }

  // Restore session from sessionStorage (page refresh reconnect)
  const saved = getSavedSession();
  if (saved) {
    setTimeout(async () => {
      const name = getUserName();
      collabManager.setUserName(name);
      await collabManager.startSession(saved.roomId, saved.roomPassword);
    }, 1500);
  }
}
