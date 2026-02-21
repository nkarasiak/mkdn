import { documentStore } from '../store/document-store.js';

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
