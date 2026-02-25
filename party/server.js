import { onConnect } from "y-partykit";

const MAX_SNAPSHOTS = 50;
const MAX_CONTENT_SIZE = 512 * 1024; // 512 KB
const MAX_FIELD_LENGTH = 200;
const VALID_TRIGGERS = new Set(["save", "autosave", "checkpoint"]);
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const ROOM_KEY_STORAGE_KEY = "room::key";

function jsonResponse(data, status, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json", ...extraHeaders },
  });
}

function truncate(str, max) {
  if (typeof str !== "string") return "";
  return str.slice(0, max);
}

export default class YjsServer {
  constructor(party) {
    this.party = party;
  }

  onConnect(conn) {
    return onConnect(conn, this.party, {
      persist: { mode: "snapshot" },
    });
  }

  async onRequest(req) {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Only handle /history path
    if (!url.pathname.endsWith("/history")) {
      return new Response("Not found", { status: 404, headers: CORS_HEADERS });
    }

    // Authenticate via room key
    const authError = await this._authenticate(url);
    if (authError) return authError;

    if (req.method === "POST") {
      return this._postHistory(req);
    }

    if (req.method === "GET") {
      return this._getHistory();
    }

    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  async _authenticate(url) {
    const key = url.searchParams.get("key");
    if (!key) {
      return jsonResponse({ error: "Missing key parameter" }, 401);
    }

    const storedKey = await this.party.storage.get(ROOM_KEY_STORAGE_KEY);
    if (storedKey) {
      if (key !== storedKey) {
        return jsonResponse({ error: "Invalid key" }, 403);
      }
    } else {
      // First request — store the key for future validation
      await this.party.storage.put(ROOM_KEY_STORAGE_KEY, key);
    }

    return null; // Authenticated
  }

  async _postHistory(req) {
    let body;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }

    const { content, userName, trigger, message } = body;
    if (typeof content !== "string") {
      return jsonResponse({ error: "content is required" }, 400);
    }

    if (content.length > MAX_CONTENT_SIZE) {
      return jsonResponse({ error: "content too large" }, 413);
    }

    const sanitizedTrigger = VALID_TRIGGERS.has(trigger) ? trigger : "save";

    const timestamp = Date.now();
    // Append random suffix to avoid key collision
    const suffix = Math.random().toString(36).slice(2, 8);
    const key = `history::${timestamp}::${suffix}`;
    const snapshot = {
      content,
      userName: truncate(userName, MAX_FIELD_LENGTH) || "Unknown",
      trigger: sanitizedTrigger,
      message: message ? truncate(message, MAX_FIELD_LENGTH) : null,
      timestamp,
    };

    await this.party.storage.put(key, snapshot);
    await this._pruneHistory();

    return jsonResponse({ ok: true, timestamp }, 201);
  }

  async _getHistory() {
    const all = await this.party.storage.list({ prefix: "history::" });
    const snapshots = [];
    for (const [, value] of all) {
      snapshots.push(value);
    }
    // Newest first
    snapshots.sort((a, b) => b.timestamp - a.timestamp);

    return jsonResponse(snapshots.slice(0, MAX_SNAPSHOTS), 200);
  }

  async _pruneHistory() {
    const all = await this.party.storage.list({ prefix: "history::" });
    if (all.size <= MAX_SNAPSHOTS) return;

    const keys = [...all.keys()].sort();
    const toDelete = keys.slice(0, keys.length - MAX_SNAPSHOTS);
    for (const key of toDelete) {
      await this.party.storage.delete(key);
    }
  }
}
