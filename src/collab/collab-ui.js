import { el } from '../utils/dom.js';
import { collabManager } from './collab-manager.js';
import { eventBus } from '../store/event-bus.js';
import { toast } from '../ui/toast.js';
import { settingsStore } from '../store/settings-store.js';

let peerIndicator = null;

export function createCollabUI() {
  // Inject styles
  const style = document.createElement('style');
  style.textContent = `
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
  `;
  document.head.appendChild(style);
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

  // Start session immediately
  const name = localStorage.getItem('mkdn-collab-name') || `User-${Math.floor(Math.random() * 1000)}`;
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
        const name = localStorage.getItem('mkdn-collab-name') || `User-${Math.floor(Math.random() * 1000)}`;
        collabManager.setUserName(name);
        await collabManager.startSession(room, key);
      }, 1500);
    }
  }
}
