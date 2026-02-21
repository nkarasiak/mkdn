import { el } from '../utils/dom.js';
import { icons } from '../toolbar/toolbar-icons.js';
import { documentStore } from '../store/document-store.js';
import { eventBus } from '../store/event-bus.js';

export function createStatusBar({ onToggleHistory } = {}) {
  // Left side: live word count + history button
  const wordCount = el('span', { className: 'statusbar-stats' }, '0 words');

  const historyBtn = el('button', {
    className: 'statusbar-icon-btn',
    'data-tooltip': 'History (Ctrl+Shift+H)',
    html: icons.clock,
    onClick: () => onToggleHistory?.(),
  });

  function updateStats() {
    const { words } = getStats(documentStore.getMarkdown());
    wordCount.textContent = `${words} word${words !== 1 ? 's' : ''}`;
  }

  eventBus.on('content:changed', updateStats);
  eventBus.on('file:opened', updateStats);
  eventBus.on('file:new', updateStats);
  updateStats();

  // Right side: info button
  const infoBtn = el('button', {
    className: 'statusbar-icon-btn',
    'data-tooltip': 'About',
    html: icons.infoCircle,
    onClick: () => {
      const { words, lines } = getStats(documentStore.getMarkdown());
      alert(`${documentStore.getFileName()}\n${words} words, ${lines} lines`);
    },
  });

  const statusEl = el('div', { className: 'statusbar' },
    el('div', { className: 'statusbar-left' }, wordCount, historyBtn),
    el('div', { className: 'statusbar-right' }, infoBtn),
  );

  return statusEl;
}

function getStats(md) {
  if (!md) return { words: 0, lines: 0 };
  const text = md.trim();
  const words = text ? text.split(/\s+/).length : 0;
  const lines = text ? text.split('\n').length : 0;
  return { words, lines };
}
