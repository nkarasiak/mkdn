// Share document as a self-contained URL
// Compresses markdown content into the URL hash using deflate + base64url
// Anyone with the link can open it — no server needed

import { documentStore } from '../store/document-store.js';
import { toast } from '../ui/toast.js';
import { isTauri } from '../platform/tauri-bridge.js';

const MAX_URL_LENGTH = 32000; // Safe limit for most browsers/servers

// --- Compression (deflate) + base64url encoding ---

async function compress(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate'));
  const buf = await new Response(stream).arrayBuffer();
  return bufToBase64url(new Uint8Array(buf));
}

async function decompress(encoded) {
  const buf = base64urlToBuf(encoded);
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Response(stream).text();
}

function bufToBase64url(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToBuf(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// --- Public API ---

export async function generateShareLink() {
  const markdown = documentStore.getMarkdown();
  if (!markdown || !markdown.trim()) {
    toast('Nothing to share — document is empty', 'warning');
    return null;
  }

  const encoded = await compress(markdown);
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}#d=${encoded}`;

  if (url.length > MAX_URL_LENGTH) {
    toast('Document too large to share as a link. Try exporting instead.', 'warning');
    return null;
  }

  try {
    await navigator.clipboard.writeText(url);
    toast('Shareable link copied to clipboard!', 'success');
  } catch {
    // Clipboard may fail — show the URL in a prompt
    window.prompt('Copy this link:', url);
  }

  return url;
}

export async function loadFromShareLink() {
  const hash = window.location.hash;
  if (!hash.startsWith('#d=')) return false;

  const encoded = hash.slice(3);
  if (!encoded) return false;

  try {
    const markdown = await decompress(encoded);
    documentStore.setFile('shared.md', 'Shared Document', markdown, 'share-link');
    // Clean the hash so the URL doesn't stay huge
    history.replaceState(null, '', window.location.pathname + window.location.search);
    toast('Shared document loaded', 'success');
    return true;
  } catch (err) {
    console.error('[share-link] Failed to decode:', err);
    toast('Failed to load shared document — link may be corrupted', 'error');
    return false;
  }
}

function getBaseUrl() {
  const origin = window.location.origin;
  if (origin.startsWith('tauri://') || origin.startsWith('https://tauri.')) {
    return 'https://nkarasiak.github.io/mkdn/';
  }
  return origin + window.location.pathname;
}
