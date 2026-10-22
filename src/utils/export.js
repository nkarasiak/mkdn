import { documentStore } from '../store/document-store.js';
import { settingsStore } from '../store/settings-store.js';

export function printDocument() {
  // If in source mode, temporarily show editor pane for printing
  const editorPane = document.querySelector('.editor-pane');
  const inSourceMode = settingsStore.get('sourceMode');
  if (inSourceMode && editorPane) {
    editorPane.style.display = 'block';
  }

  const cleanup = () => {
    if (inSourceMode && editorPane) {
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
