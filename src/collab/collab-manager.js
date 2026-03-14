import * as Y from 'yjs';
import YPartyKitProvider from 'y-partykit/provider';
import { ySyncPlugin, yCursorPlugin, yUndoPlugin, undo, redo } from 'y-prosemirror';
import { milkdown } from '../editor/milkdown-setup.js';
import { documentStore } from '../store/document-store.js';
import { eventBus } from '../store/event-bus.js';
import { toast } from '../ui/toast.js';
import { settingsStore } from '../store/settings-store.js';
import { STORAGE_COLLAB_NAME, SESSION_COLLAB, PARTYKIT_ROOM_PREFIX } from '../constants.js';

let ydoc = null;
let provider = null;
let awareness = null;
let roomId = null;
let roomPassword = null;
let isCollaborating = false;

// Random color for cursor
const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
];

function randomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function generateRoomId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, b => chars[b % chars.length]).join('');
}

function generatePassword() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

export function getUserName() {
  let name = localStorage.getItem(STORAGE_COLLAB_NAME);
  if (!name) {
    name = `User-${Math.floor(Math.random() * 1000)}`;
    localStorage.setItem(STORAGE_COLLAB_NAME, name);
  }
  return name;
}

function saveSession() {
  if (roomId && roomPassword) {
    localStorage.setItem(SESSION_COLLAB, JSON.stringify({ roomId, roomPassword }));
  }
}

function clearSession() {
  localStorage.removeItem(SESSION_COLLAB);
}

export function getSavedSession() {
  try {
    const raw = localStorage.getItem(SESSION_COLLAB);
    if (!raw) return null;
    const { roomId, roomPassword } = JSON.parse(raw);
    return roomId ? { roomId, roomPassword } : null;
  } catch {
    return null;
  }
}

export const collabManager = {
  isActive() {
    return isCollaborating;
  },

  getRoomId() {
    return roomId;
  },

  getRoomPassword() {
    return roomPassword;
  },

  getConnectedPeers() {
    if (!awareness) return [];
    const states = awareness.getStates();
    const peers = [];
    states.forEach((state, clientId) => {
      if (clientId !== ydoc.clientID && state.user) {
        peers.push(state.user);
      }
    });
    return peers;
  },

  setUserName(name) {
    localStorage.setItem(STORAGE_COLLAB_NAME, name);
    if (awareness) {
      awareness.setLocalStateField('user', {
        name,
        color: awareness.getLocalState()?.user?.color || randomColor(),
      });
    }
  },

  async startSession(existingRoomId = null, existingPassword = null) {
    if (isCollaborating) {
      toast('Already in a collaboration session', 'warning');
      return;
    }

    const view = milkdown.getView();
    if (!view) {
      toast('Editor not ready', 'error');
      return;
    }

    const serverUrl = settingsStore.get('collabServerUrl');
    if (!serverUrl) {
      toast('Set a PartyKit server URL in settings before collaborating', 'error');
      return;
    }

    // Enforce HTTPS for non-local servers
    if (!/^https:/.test(serverUrl) && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(serverUrl)) {
      toast('Collaboration requires an HTTPS server URL', 'error');
      return;
    }

    roomId = existingRoomId || generateRoomId();
    roomPassword = existingPassword || generatePassword();
    ydoc = new Y.Doc();

    const params = {};
    if (roomPassword) {
      params.key = roomPassword;
    }

    provider = new YPartyKitProvider(serverUrl, `${PARTYKIT_ROOM_PREFIX}${roomId}`, ydoc, {
      params,
    });

    awareness = provider.awareness;

    const userName = getUserName();
    const userColor = randomColor();

    awareness.setLocalStateField('user', {
      name: userName,
      color: userColor,
    });

    // Get the Yjs XML fragment for ProseMirror
    const yXmlFragment = ydoc.getXmlFragment('prosemirror');

    // If we're starting a new room (not joining), initialize with current content
    if (!existingRoomId) {
      // Wait a moment to see if there's already content from the server
      await new Promise(resolve => setTimeout(resolve, 500));

      if (yXmlFragment.length === 0) {
        // No existing content - initialize from current document
        const currentMarkdown = documentStore.getMarkdown();
        if (currentMarkdown && currentMarkdown.trim()) {
          // We'll insert the current document into the Yjs doc via ProseMirror
          // after the plugins are applied
        }
      }
    }

    // Apply Yjs plugins to the ProseMirror editor
    const syncPlugin = ySyncPlugin(yXmlFragment);
    const cursorPlugin = yCursorPlugin(awareness);
    const undoPlugin = yUndoPlugin();

    // Store plugins for cleanup
    this._yjsPlugins = [syncPlugin, cursorPlugin, undoPlugin];

    // Add plugins to the existing ProseMirror view
    const { state } = view;
    const newPlugins = [...state.plugins, syncPlugin, cursorPlugin, undoPlugin];
    const newState = state.reconfigure({ plugins: newPlugins });
    view.updateState(newState);

    // If starting new room, insert current content
    if (!existingRoomId && yXmlFragment.length === 0) {
      setTimeout(() => {
        const currentMarkdown = documentStore.getMarkdown();
        if (currentMarkdown) {
          milkdown.setContent(currentMarkdown);
        }
      }, 200);
    }

    isCollaborating = true;

    // Persist session so page refresh auto-reconnects
    saveSession();

    // Listen for awareness changes
    awareness.on('change', () => {
      eventBus.emit('collab:peers-changed', {
        peers: this.getConnectedPeers(),
      });
    });

    provider.on('sync', () => {
      eventBus.emit('collab:synced');
    });

    eventBus.emit('collab:started', { roomId });

    return roomId;
  },

  stopSession() {
    if (!isCollaborating) return;

    // Remove Yjs plugins from ProseMirror
    const view = milkdown.getView();
    if (view && this._yjsPlugins) {
      const pluginSet = new Set(this._yjsPlugins);
      const filteredPlugins = view.state.plugins.filter(p => !pluginSet.has(p));
      const newState = view.state.reconfigure({ plugins: filteredPlugins });
      view.updateState(newState);
    }

    if (provider) {
      provider.disconnect();
      provider.destroy();
      provider = null;
    }

    if (ydoc) {
      ydoc.destroy();
      ydoc = null;
    }

    awareness = null;
    roomId = null;
    roomPassword = null;
    isCollaborating = false;
    this._yjsPlugins = null;

    clearSession();
    eventBus.emit('collab:stopped');
  },

  getShareUrl() {
    if (!roomId) return null;
    // Use the web deployment URL — window.location may be tauri://localhost in desktop
    const origin = window.location.origin;
    const isTauriOrigin = origin.startsWith('tauri://') || origin.startsWith('https://tauri.');
    const baseUrl = isTauriOrigin
      ? (settingsStore.get('collabShareBaseUrl') || 'https://nkarasiak.github.io/mkdn/')
      : origin + window.location.pathname;
    return `${baseUrl}#s=${roomId}.${roomPassword}`;
  },
};
