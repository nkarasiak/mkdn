// Clipboard for the right-click menu. Desktop goes through the Tauri plugin: WebKitGTK
// doesn't let a click read the clipboard.
import { isTauri } from '../platform/tauri-bridge.js';
import { toast } from '../ui/toast.js';

const tauri = () => import('@tauri-apps/plugin-clipboard-manager');

// Cut/copy through the browser so ProseMirror's own clipboard handlers serialize the selection.
export function cut(view) {
  view.focus();
  document.execCommand('cut');
}

export function copy(view) {
  view.focus();
  document.execCommand('copy');
}

// A synthetic paste event carrying the data runs the editor's paste plugins (markdown, smart paste).
function pasteData(view, data) {
  const dt = new DataTransfer();
  for (const [type, value] of Object.entries(data)) dt.setData(type, value);
  const event = new ClipboardEvent('paste', { clipboardData: dt });
  if (data['text/html']) view.pasteHTML(data['text/html'], event);
  else view.pasteText(data['text/plain'], event);
}

async function readText() {
  return isTauri() ? (await tauri()).readText() : navigator.clipboard.readText();
}

export async function paste(view) {
  view.focus();
  try {
    if (isTauri()) return pasteData(view, { 'text/plain': await readText() });
    const [item] = await navigator.clipboard.read();
    const data = {};
    for (const type of ['text/html', 'text/plain']) {
      if (item?.types.includes(type)) data[type] = await (await item.getType(type)).text();
    }
    if (data['text/html'] || data['text/plain']) pasteData(view, data);
  } catch {
    toast('Use Ctrl+V to paste');
  }
}

/** Paste as plain text: no markdown, no formatting (lines become paragraphs). */
export async function pastePlain(view) {
  view.focus();
  try {
    view.pasteText(await readText());
  } catch {
    toast('Use Ctrl+Shift+V to paste as plain text');
  }
}

export async function writeClipboard({ html, text }, done = 'Copied') {
  try {
    if (isTauri()) {
      const c = await tauri();
      await (html ? c.writeHtml(html, text) : c.writeText(text));
    } else {
      const blob = (type, s) => new Blob([s], { type });
      await navigator.clipboard.write([new ClipboardItem({
        ...(html ? { 'text/html': blob('text/html', html) } : {}),
        'text/plain': blob('text/plain', text),
      })]);
    }
    toast(done);
  } catch {
    toast('Copy failed', 'error');
  }
}
