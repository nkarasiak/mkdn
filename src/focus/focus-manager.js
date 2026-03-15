import { settingsStore } from '../store/settings-store.js';
import { eventBus } from '../store/event-bus.js';
import { el } from '../utils/dom.js';

let appEl = null;
let revealTimer = null;
let hintEl = null;
let sessionStatsEl = null;
let sessionStatsTimer = null;

// Cycle: Normal → Writing → Zen → Zen+Focus → Zen+Focus+Typewriter → Normal
const MODES = [
  { zen: false, writing: false, focus: false, typewriter: false },
  { zen: false, writing: true,  focus: false, typewriter: false },
  { zen: true,  writing: false, focus: false, typewriter: false },
  { zen: true,  writing: false, focus: true,  typewriter: false },
  { zen: true,  writing: false, focus: true,  typewriter: true  },
];

function getCurrentIndex() {
  const zen = settingsStore.get('zenMode');
  const writing = settingsStore.get('writingMode');
  const focus = settingsStore.get('paragraphFocus');
  const tw = settingsStore.get('typewriterMode');
  const idx = MODES.findIndex(m =>
    m.zen === zen && m.writing === writing && m.focus === focus && m.typewriter === tw
  );
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

function applyWritingMode(on) {
  if (!appEl) return;
  appEl.classList.toggle('writing-mode', on);
  if (on) {
    showSessionStats();
  } else {
    hideSessionStats();
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

// Session stats overlay for writing mode
function showSessionStats() {
  hideSessionStats();
  sessionStatsEl = el('div', { className: 'writing-mode-session-stats' });
  document.body.appendChild(sessionStatsEl);
  updateSessionStats();
  sessionStatsTimer = setInterval(updateSessionStats, 10000);
}

function hideSessionStats() {
  clearInterval(sessionStatsTimer);
  if (sessionStatsEl) {
    sessionStatsEl.remove();
    sessionStatsEl = null;
  }
}

function updateSessionStats() {
  if (!sessionStatsEl) return;
  // Import dynamically to avoid circular deps
  const md = document.querySelector('.ProseMirror')?.textContent || '';
  const words = md.trim() ? md.trim().split(/\s+/).length : 0;
  sessionStatsEl.textContent = `${words} words`;
}

export const focusManager = {
  init(app) {
    appEl = app;

    // Listen for settings changes
    eventBus.on('settings:zenMode', applyZen);
    eventBus.on('settings:writingMode', applyWritingMode);
    eventBus.on('settings:paragraphFocus', applyParagraphFocus);
    eventBus.on('settings:typewriterMode', applyTypewriter);

    // Apply initial state (all false on load, but just in case)
    applyZen(settingsStore.get('zenMode'));
    applyWritingMode(settingsStore.get('writingMode'));
    applyParagraphFocus(settingsStore.get('paragraphFocus'));
    applyTypewriter(settingsStore.get('typewriterMode'));
  },

  cycleMode() {
    const current = getCurrentIndex();
    const next = (current + 1) % MODES.length;
    const mode = MODES[next];

    settingsStore.set('zenMode', mode.zen);
    settingsStore.set('writingMode', mode.writing);
    settingsStore.set('paragraphFocus', mode.focus);
    settingsStore.set('typewriterMode', mode.typewriter);
  },

  exitAllModes() {
    if (!settingsStore.get('zenMode') && !settingsStore.get('paragraphFocus') &&
        !settingsStore.get('typewriterMode') && !settingsStore.get('writingMode')) {
      return false;
    }
    settingsStore.set('zenMode', false);
    settingsStore.set('writingMode', false);
    settingsStore.set('paragraphFocus', false);
    settingsStore.set('typewriterMode', false);
    return true;
  },

  isActive() {
    return settingsStore.get('zenMode') || settingsStore.get('paragraphFocus') ||
           settingsStore.get('typewriterMode') || settingsStore.get('writingMode');
  },

  getCurrentModeLabel() {
    const parts = [];
    if (settingsStore.get('writingMode')) parts.push('Writing');
    if (settingsStore.get('zenMode')) parts.push('Zen');
    if (settingsStore.get('paragraphFocus')) parts.push('Focus');
    if (settingsStore.get('typewriterMode')) parts.push('Typewriter');
    return parts.join(' + ');
  },
};
