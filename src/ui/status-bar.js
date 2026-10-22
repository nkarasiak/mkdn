import { el } from '../utils/dom.js';
import { documentStore } from '../store/document-store.js';
import { eventBus } from '../store/event-bus.js';
import { settingsStore } from '../store/settings-store.js';

/** gedit-style status bar: "Ln 4, Col 12   123 words" (Ln/Col only in source view, where it's exact). */
export function createStatusBar(sourceEditor) {
  const posEl = el('span', { className: 'statusbar-pos' });
  const wordsEl = el('span', { className: 'statusbar-words' });

  function updateWords() {
    const text = documentStore.getMarkdown().trim();
    const words = text ? text.split(/\s+/).length : 0;
    wordsEl.textContent = `${words} word${words === 1 ? '' : 's'}`;
  }

  function updatePos() {
    if (!settingsStore.get('sourceMode')) {
      posEl.textContent = '';
      return;
    }
    const before = sourceEditor.value.slice(0, sourceEditor.selectionStart);
    const line = before.split('\n').length;
    const col = before.length - before.lastIndexOf('\n');
    posEl.textContent = `Ln ${line}, Col ${col}`;
  }

  for (const evt of ['content:changed', 'file:opened', 'file:new']) eventBus.on(evt, updateWords);
  eventBus.on('settings:sourceMode', updatePos);
  document.addEventListener('selectionchange', updatePos);
  sourceEditor.addEventListener('selectionchange', updatePos);
  updateWords();
  updatePos();

  return el('footer', { className: 'statusbar' }, posEl, wordsEl);
}
