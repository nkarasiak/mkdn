import { collabManager } from './collab-manager.js';
import { settingsStore } from '../store/settings-store.js';
import { STORAGE_COLLAB_NAME, PARTYKIT_ROOM_PREFIX } from '../constants.js';

function buildRequest() {
  const serverUrl = settingsStore.get('collabServerUrl');
  const roomId = collabManager.getRoomId();
  const roomKey = collabManager.getRoomPassword();
  if (!serverUrl || !roomId || !roomKey) return null;
  const url = `${serverUrl.replace(/\/$/, '')}/parties/main/${PARTYKIT_ROOM_PREFIX}${roomId}/history`;
  return { url, roomKey };
}

export async function pushSnapshot({ content, trigger, message }) {
  const req = buildRequest();
  if (!req) return;

  const userName = localStorage.getItem(STORAGE_COLLAB_NAME) || 'Unknown';

  try {
    await fetch(req.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Room-Key': req.roomKey },
      body: JSON.stringify({ content, userName, trigger, message: message || null }),
    });
  } catch {
    // Best-effort — never block the editor
  }
}

export async function fetchSnapshots() {
  const req = buildRequest();
  if (!req) return [];

  try {
    const res = await fetch(req.url, {
      headers: { 'X-Room-Key': req.roomKey },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}
