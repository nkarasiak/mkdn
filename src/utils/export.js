import { documentStore } from '../store/document-store.js';
import { settingsStore } from '../store/settings-store.js';

export function printDocument() {
  const fileName = documentStore.getFileName() || 'Untitled.md';
  const title = fileName.replace(/\.md$/i, '');

  // Inject print title
  const titleEl = document.createElement('div');
  titleEl.className = 'print-title';
  titleEl.textContent = title;
  const editorPane = document.querySelector('.editor-pane');
  if (editorPane) {
    editorPane.insertBefore(titleEl, editorPane.firstChild);
  }

  // If in source mode, temporarily show editor pane for printing
  const inSourceMode = settingsStore.get('sourceMode');
  if (inSourceMode) {
    editorPane.style.display = 'block';
  }

  const cleanup = () => {
    titleEl.remove();
    if (inSourceMode) {
      editorPane.style.display = 'none';
    }
  };

  window.addEventListener('afterprint', cleanup, { once: true });
  window.print();
}

export function downloadMarkdown() {
  const content = documentStore.getMarkdown();
  const fileName = documentStore.getFileName() || 'Untitled.md';
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function copyHtml() {
  const pm = document.querySelector('.ProseMirror');
  if (!pm) return;
  const html = pm.innerHTML;
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([pm.innerText], { type: 'text/plain' }),
      }),
    ]);
  } catch {
    // Fallback: copy as plain text
    await navigator.clipboard.writeText(pm.innerText);
  }
}
