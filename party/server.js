import { onConnect } from "y-partykit";

const MAX_SNAPSHOTS = 50;
const MAX_CONTENT_SIZE = 512 * 1024; // 512 KB
const MAX_FIELD_LENGTH = 200;
const VALID_TRIGGERS = new Set(["save", "autosave", "checkpoint"]);
const ALLOWED_ORIGINS = new Set([
  "https://nkk.github.io",
  "https://nkarasiak.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "tauri://localhost",
]);

function corsHeaders(request) {
  const origin = request?.headers?.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Room-Key",
    "Vary": "Origin",
  };
}
const ROOM_KEY_STORAGE_KEY = "room::key";

function jsonResponse(data, status, request, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json", ...extraHeaders },
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
    const cors = corsHeaders(req);

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    // Only handle /history path
    if (!url.pathname.endsWith("/history")) {
      return new Response("Not found", { status: 404, headers: cors });
    }

    // Authenticate via room key (header preferred, query param as fallback)
    const authError = await this._authenticate(req);
    if (authError) return authError;

    if (req.method === "POST") {
      return this._postHistory(req);
    }

    if (req.method === "GET") {
      return this._getHistory(req);
    }

    return new Response("Method not allowed", { status: 405, headers: cors });
  }

  async _authenticate(req) {
    // Prefer X-Room-Key header; fall back to query param for backward compat
    const url = new URL(req.url);
    const key = req.headers.get("X-Room-Key") || url.searchParams.get("key");
    if (!key) {
      return jsonResponse({ error: "Missing room key" }, 401, req);
    }

    const storedKey = await this.party.storage.get(ROOM_KEY_STORAGE_KEY);
    if (storedKey) {
      if (key !== storedKey) {
        return jsonResponse({ error: "Invalid key" }, 403, req);
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
      return jsonResponse({ error: "Invalid JSON" }, 400, req);
    }

    const { content, userName, trigger, message } = body;
    if (typeof content !== "string") {
      return jsonResponse({ error: "content is required" }, 400, req);
    }

    if (content.length > MAX_CONTENT_SIZE) {
      return jsonResponse({ error: "content too large" }, 413, req);
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

    return jsonResponse({ ok: true, timestamp }, 201, req);
  }

  async _getHistory(req) {
    const all = await this.party.storage.list({ prefix: "history::" });
    const snapshots = [];
    for (const [, value] of all) {
      snapshots.push(value);
    }
    // Newest first
    snapshots.sort((a, b) => b.timestamp - a.timestamp);

    return jsonResponse(snapshots.slice(0, MAX_SNAPSHOTS), 200, req);
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
