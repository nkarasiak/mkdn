import { el } from '../utils/dom.js';
import { settingsStore } from '../store/settings-store.js';

const DEFAULT_WIDTH = 820;
const WIDE_WIDTH = 1040;
const MIN_WIDTH = 400;
const MAX_WIDTH_PCT = 0.95;

function clamp(width, containerWidth) {
  const max = Math.max(MIN_WIDTH, containerWidth * MAX_WIDTH_PCT);
  return Math.round(Math.max(MIN_WIDTH, Math.min(max, width)));
}

function apply(width) {
  document.documentElement.style.setProperty('--content-max-width', width + 'px');
}

export function initContentWidthHandle(mainEl) {
  const saved = settingsStore.get('contentMaxWidth');
  if (saved && Number.isFinite(saved)) {
    apply(clamp(saved, window.innerWidth));
  }

  const handle = el('div', {
    className: 'content-width-handle',
    title: 'Drag to resize content width — double-click to reset',
    'aria-label': 'Resize content width',
  });
  mainEl.appendChild(handle);

  let startX = 0;
  let startWidth = 0;

  function getCurrentWidth() {
    return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--content-max-width')) || DEFAULT_WIDTH;
  }

  function onMouseMove(e) {
    const rect = mainEl.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const newWidth = clamp(2 * (e.clientX - centerX), rect.width);
    apply(newWidth);
  }

  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.body.classList.remove('resizing');
    handle.classList.remove('active');
    settingsStore.set('contentMaxWidth', getCurrentWidth());
  }

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startX = e.clientX;
    startWidth = getCurrentWidth();
    document.body.classList.add('resizing');
    handle.classList.add('active');
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  handle.addEventListener('dblclick', () => {
    const current = getCurrentWidth();
    const rect = mainEl.getBoundingClientRect();
    const wide = clamp(WIDE_WIDTH, rect.width);
    if (Math.abs(current - DEFAULT_WIDTH) < 4) {
      apply(wide);
      settingsStore.set('contentMaxWidth', wide);
    } else {
      apply(DEFAULT_WIDTH);
      settingsStore.set('contentMaxWidth', null);
    }
  });
}
