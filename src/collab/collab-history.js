import { collabManager } from './collab-manager.js';
import { settingsStore } from '../store/settings-store.js';
import { STORAGE_COLLAB_NAME, PARTYKIT_ROOM_PREFIX } from '../constants.js';

function buildUrl() {
  const serverUrl = settingsStore.get('collabServerUrl');
  const roomId = collabManager.getRoomId();
  const roomKey = collabManager.getRoomPassword();
  if (!serverUrl || !roomId || !roomKey) return null;
  // PartyKit HTTP endpoint: <server>/parties/main/mkdn-<roomId>/history?key=<roomKey>
  const base = `${serverUrl.replace(/\/$/, '')}/parties/main/${PARTYKIT_ROOM_PREFIX}${roomId}/history`;
  return `${base}?key=${encodeURIComponent(roomKey)}`;
}

export async function pushSnapshot({ content, trigger, message }) {
  const url = buildUrl();
  if (!url) return;

  const userName = localStorage.getItem(STORAGE_COLLAB_NAME) || 'Unknown';

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, userName, trigger, message: message || null }),
    });
  } catch {
    // Best-effort — never block the editor
  }
}

export async function fetchSnapshots() {
  const url = buildUrl();
  if (!url) return [];

  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}
