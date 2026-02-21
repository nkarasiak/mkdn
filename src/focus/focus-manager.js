import { settingsStore } from '../store/settings-store.js';
import { eventBus } from '../store/event-bus.js';
import { el } from '../utils/dom.js';

let appEl = null;
let revealTimer = null;
let hintEl = null;

// Cycle: Normal → Zen → Zen+Focus → Zen+Focus+Typewriter → Normal
const MODES = [
  { zen: false, focus: false, typewriter: false },
  { zen: true,  focus: false, typewriter: false },
  { zen: true,  focus: true,  typewriter: false },
  { zen: true,  focus: true,  typewriter: true  },
];

function getCurrentIndex() {
  const zen = settingsStore.get('zenMode');
  const focus = settingsStore.get('paragraphFocus');
  const tw = settingsStore.get('typewriterMode');
  const idx = MODES.findIndex(m => m.zen === zen && m.focus === focus && m.typewriter === tw);
  return idx >= 0 ? idx : 0;
}

function applyZen(on) {
  if (!appEl) return;
  appEl.classList.toggle('zen-mode', on);
  if (on) {
    showEscapeHint();
    addMouseReveal();
  } else {
    removeMouseReveal();
    removeEscapeHint();
  }
}

function applyParagraphFocus(on) {
  const pm = document.querySelector('.ProseMirror');
  if (pm) pm.classList.toggle('paragraph-focus', on);
  // Trigger decoration rebuild via editor transaction
  eventBus.emit('focus:refresh-plugins');
}

function applyTypewriter(on) {
  const pm = document.querySelector('.ProseMirror');
  if (pm) pm.classList.toggle('typewriter-mode', on);
}

function showEscapeHint() {
  removeEscapeHint();
  hintEl = el('div', { className: 'zen-escape-hint' }, 'Press Esc to exit Zen mode');
  document.body.appendChild(hintEl);
  // Remove after animation completes
  setTimeout(() => removeEscapeHint(), 3200);
}

function removeEscapeHint() {
  if (hintEl) {
    hintEl.remove();
    hintEl = null;
  }
}

// Mouse reveal logic for zen mode toolbar
function onMouseMove(e) {
  if (!appEl?.classList.contains('zen-mode')) return;
  const toolbar = appEl.querySelector('.app-toolbar');
  if (!toolbar) return;

  if (e.clientY <= 60) {
    toolbar.classList.add('zen-reveal');
    clearTimeout(revealTimer);
    revealTimer = setTimeout(() => {
      toolbar.classList.remove('zen-reveal');
    }, 2000);
  } else {
    // If mouse moves away from top, hide after short delay
    if (toolbar.classList.contains('zen-reveal')) {
      clearTimeout(revealTimer);
      revealTimer = setTimeout(() => {
        toolbar.classList.remove('zen-reveal');
      }, 500);
    }
  }
}

function addMouseReveal() {
  document.addEventListener('mousemove', onMouseMove);
}

function removeMouseReveal() {
  document.removeEventListener('mousemove', onMouseMove);
  clearTimeout(revealTimer);
  const toolbar = appEl?.querySelector('.app-toolbar');
  toolbar?.classList.remove('zen-reveal');
}

export const focusManager = {
  init(app) {
    appEl = app;

    // Listen for settings changes
    eventBus.on('settings:zenMode', applyZen);
    eventBus.on('settings:paragraphFocus', applyParagraphFocus);
    eventBus.on('settings:typewriterMode', applyTypewriter);

    // Apply initial state (all false on load, but just in case)
    applyZen(settingsStore.get('zenMode'));
    applyParagraphFocus(settingsStore.get('paragraphFocus'));
    applyTypewriter(settingsStore.get('typewriterMode'));
  },

  cycleMode() {
    const current = getCurrentIndex();
    const next = (current + 1) % MODES.length;
    const mode = MODES[next];

    settingsStore.set('zenMode', mode.zen);
    settingsStore.set('paragraphFocus', mode.focus);
    settingsStore.set('typewriterMode', mode.typewriter);
  },

  exitAllModes() {
    if (!settingsStore.get('zenMode') && !settingsStore.get('paragraphFocus') && !settingsStore.get('typewriterMode')) {
      return false;
    }
    settingsStore.set('zenMode', false);
    settingsStore.set('paragraphFocus', false);
    settingsStore.set('typewriterMode', false);
    return true;
  },

  isActive() {
    return settingsStore.get('zenMode') || settingsStore.get('paragraphFocus') || settingsStore.get('typewriterMode');
  },

  getCurrentModeLabel() {
    const parts = [];
    if (settingsStore.get('zenMode')) parts.push('Zen');
    if (settingsStore.get('paragraphFocus')) parts.push('Focus');
    if (settingsStore.get('typewriterMode')) parts.push('Typewriter');
    return parts.join(' + ');
  },
};
