import { el, injectStyles } from '../utils/dom.js';
import { eventBus } from '../store/event-bus.js';
import { documentStore } from '../store/document-store.js';
import { settingsStore } from '../store/settings-store.js';

const STORAGE_KEY = 'mkdn-writing-goals';
const STREAK_KEY = 'mkdn-writing-streak';
const HISTORY_KEY = 'mkdn-writing-history';

// --- Persistent state ---

function loadGoals() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { daily: 0, session: 0, document: 0 };
  } catch { return { daily: 0, session: 0, document: 0 }; }
}

function saveGoals(goals) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
}

function loadStreak() {
  try {
    return JSON.parse(localStorage.getItem(STREAK_KEY)) || { count: 0, lastDate: null };
  } catch { return { count: 0, lastDate: null }; }
}

function saveStreak(streak) {
  localStorage.setItem(STREAK_KEY, JSON.stringify(streak));
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || {};
  } catch { return {}; }
}

function saveHistory(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

// --- Word counting ---

function getWordCount(md) {
  if (!md) return 0;
  const text = md.replace(/[#*_`~\[\]()>|\\-]/g, ' ').trim();
  return text ? text.split(/\s+/).length : 0;
}

// --- Session tracking ---

let sessionStartWords = 0;
let sessionStartTime = Date.now();
let lastActivityTime = Date.now();
let activeWritingMs = 0;
let activityCheckInterval = null;

function getSessionWords() {
  const current = getWordCount(documentStore.getMarkdown());
  return Math.max(0, current - sessionStartWords);
}

function getActiveMinutes() {
  return Math.floor(activeWritingMs / 60000);
}

// --- Daily tracking ---

function getTodayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function recordDailyWords(words) {
  if (words <= 0) return;
  const history = loadHistory();
  const today = getTodayKey();
  history[today] = (history[today] || 0) + words;

  // Keep only last 90 days
  const keys = Object.keys(history).sort();
  if (keys.length > 90) {
    keys.slice(0, keys.length - 90).forEach(k => delete history[k]);
  }
  saveHistory(history);
}

function getTodayWords() {
  const history = loadHistory();
  return history[getTodayKey()] || 0;
}

// --- Streak ---

function updateStreak() {
  const streak = loadStreak();
  const today = getTodayKey();

  if (streak.lastDate === today) return streak; // Already logged today

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);

  if (streak.lastDate === yesterdayKey) {
    streak.count++;
  } else if (streak.lastDate !== today) {
    streak.count = 1;
  }

  streak.lastDate = today;
  saveStreak(streak);
  return streak;
}

// --- Progress bar UI ---

let progressBarEl = null;
let progressFillEl = null;
let progressLabelEl = null;
let sessionStatsEl = null;

function createProgressBar() {
  if (progressBarEl) return progressBarEl;

  progressFillEl = el('div', { className: 'writing-goal-fill' });
  progressLabelEl = el('span', { className: 'writing-goal-label' });

  progressBarEl = el('div', { className: 'writing-goal-bar' },
    progressFillEl,
    progressLabelEl,
  );

  return progressBarEl;
}

function createSessionStats() {
  if (sessionStatsEl) return sessionStatsEl;

  sessionStatsEl = el('div', { className: 'writing-session-stats' });
  return sessionStatsEl;
}

function updateProgressBar() {
  if (!progressBarEl) return;

  const goals = loadGoals();
  const sessionWords = getSessionWords();
  const todayWords = getTodayWords() + sessionWords;

  // Pick the active goal (prefer daily > session > document)
  let target = 0;
  let current = 0;
  let label = '';

  if (goals.daily > 0) {
    target = goals.daily;
    current = todayWords;
    label = `${current}/${target} daily`;
  } else if (goals.session > 0) {
    target = goals.session;
    current = sessionWords;
    label = `${current}/${target} session`;
  } else if (goals.document > 0) {
    target = goals.document;
    current = getWordCount(documentStore.getMarkdown());
    label = `${current}/${target} document`;
  }

  if (target <= 0) {
    progressBarEl.style.display = 'none';
    return;
  }

  progressBarEl.style.display = '';
  const pct = Math.min(100, Math.round((current / target) * 100));
  progressFillEl.style.width = `${pct}%`;
  progressLabelEl.textContent = label;

  // Color transition: muted → accent → success
  if (pct >= 100) {
    progressFillEl.style.background = 'var(--success)';
  } else {
    progressFillEl.style.background = 'var(--accent)';
  }
}

function updateSessionStatsDisplay() {
  if (!sessionStatsEl) return;

  const sessionWords = getSessionWords();
  const mins = getActiveMinutes();
  const streak = loadStreak();

  const parts = [];
  if (sessionWords > 0) parts.push(`+${sessionWords} words`);
  if (mins > 0) parts.push(`${mins}m writing`);
  if (streak.count > 1) parts.push(`\u{1F525} ${streak.count} day streak`);

  sessionStatsEl.textContent = parts.join('  \u00B7  ');
  sessionStatsEl.style.display = parts.length > 0 ? '' : 'none';
}

// --- Goal setting modal ---

export function openGoalSettings() {
  const goals = loadGoals();

  const dailyInput = el('input', {
    type: 'number',
    className: 'goal-input',
    value: String(goals.daily || ''),
    placeholder: '0 (disabled)',
    min: '0',
    step: '100',
  });

  const sessionInput = el('input', {
    type: 'number',
    className: 'goal-input',
    value: String(goals.session || ''),
    placeholder: '0 (disabled)',
    min: '0',
    step: '100',
  });

  const documentInput = el('input', {
    type: 'number',
    className: 'goal-input',
    value: String(goals.document || ''),
    placeholder: '0 (disabled)',
    min: '0',
    step: '100',
  });

  const streak = loadStreak();
  const todayWords = getTodayWords() + getSessionWords();
  const history = loadHistory();

  // Build activity heatmap (last 7 weeks)
  const heatmapEl = buildHeatmap(history);

  const content = el('div', { className: 'goal-settings' },
    el('div', { className: 'goal-summary' },
      el('div', { className: 'goal-stat' },
        el('div', { className: 'goal-stat-value' }, String(todayWords)),
        el('div', { className: 'goal-stat-label' }, 'Words today'),
      ),
      el('div', { className: 'goal-stat' },
        el('div', { className: 'goal-stat-value' }, `${streak.count}`),
        el('div', { className: 'goal-stat-label' }, 'Day streak'),
      ),
      el('div', { className: 'goal-stat' },
        el('div', { className: 'goal-stat-value' }, `+${getSessionWords()}`),
        el('div', { className: 'goal-stat-label' }, 'This session'),
      ),
    ),
    el('h4', { className: 'goal-section-title' }, 'Word Goals'),
    el('div', { className: 'goal-row' },
      el('label', { className: 'goal-label' }, 'Daily goal'),
      dailyInput,
    ),
    el('div', { className: 'goal-row' },
      el('label', { className: 'goal-label' }, 'Session goal'),
      sessionInput,
    ),
    el('div', { className: 'goal-row' },
      el('label', { className: 'goal-label' }, 'Document goal'),
      documentInput,
    ),
    el('h4', { className: 'goal-section-title' }, 'Activity'),
    heatmapEl,
    el('div', { className: 'goal-actions' },
      el('button', {
        className: 'goal-save-btn',
        onClick: () => {
          saveGoals({
            daily: parseInt(dailyInput.value) || 0,
            session: parseInt(sessionInput.value) || 0,
            document: parseInt(documentInput.value) || 0,
          });
          updateProgressBar();
          updateSessionStatsDisplay();
          // Close modal
          document.querySelector('.modal-overlay')?.click();
        },
      }, 'Save Goals'),
    ),
  );

  import('../ui/modal.js').then(({ showInfo }) => showInfo('Writing Goals', content));
}

function buildHeatmap(history) {
  const weeks = 7;
  const today = new Date();
  const container = el('div', { className: 'heatmap-container' });
  const grid = el('div', { className: 'heatmap-grid' });

  // Find max for color scaling
  const values = Object.values(history);
  const maxWords = Math.max(1, ...values);

  for (let w = weeks - 1; w >= 0; w--) {
    const col = el('div', { className: 'heatmap-col' });
    for (let d = 0; d < 7; d++) {
      const date = new Date(today);
      date.setDate(date.getDate() - (w * 7 + (6 - d)));
      const key = date.toISOString().slice(0, 10);
      const words = history[key] || 0;
      const intensity = words > 0 ? Math.max(0.15, Math.min(1, words / maxWords)) : 0;

      const cell = el('div', {
        className: 'heatmap-cell',
        'data-tooltip': `${key}: ${words} words`,
      });

      if (words > 0) {
        cell.style.background = `color-mix(in srgb, var(--accent) ${Math.round(intensity * 100)}%, var(--bg-tertiary))`;
      }

      col.appendChild(cell);
    }
    grid.appendChild(col);
  }

  container.appendChild(grid);
  return container;
}

// --- Initialization ---

export function initWritingGoals(statusBarLeftEl) {
  sessionStartWords = getWordCount(documentStore.getMarkdown());
  sessionStartTime = Date.now();
  lastActivityTime = Date.now();
  activeWritingMs = 0;

  // Create and attach progress bar to status bar
  const bar = createProgressBar();
  const stats = createSessionStats();

  if (statusBarLeftEl) {
    statusBarLeftEl.appendChild(bar);
    statusBarLeftEl.appendChild(stats);
  }

  // Track writing activity
  eventBus.on('content:changed', ({ source } = {}) => {
    if (source !== 'milkdown' && source !== 'source-editor') return;

    const now = Date.now();
    const gap = now - lastActivityTime;

    // Count as active if gap < 30 seconds
    if (gap < 30000) {
      activeWritingMs += gap;
    }
    lastActivityTime = now;

    updateProgressBar();
    updateSessionStatsDisplay();
  });

  // Periodic check for streak + daily recording
  activityCheckInterval = setInterval(() => {
    const sessionWords = getSessionWords();
    if (sessionWords > 0) {
      recordDailyWords(sessionWords);
      sessionStartWords = getWordCount(documentStore.getMarkdown());
      updateStreak();
    }
    updateSessionStatsDisplay();
  }, 60000); // every minute

  // Record on page unload
  window.addEventListener('beforeunload', () => {
    const sessionWords = getSessionWords();
    if (sessionWords > 0) {
      recordDailyWords(sessionWords);
      updateStreak();
    }
  });

  updateProgressBar();
  updateSessionStatsDisplay();
}

export function getStreakCount() {
  return loadStreak().count;
}

// --- Styles ---

injectStyles(`
  .writing-goal-bar {
    display: none;
    position: relative;
    height: 3px;
    width: 80px;
    background: var(--bg-tertiary);
    border-radius: 2px;
    overflow: hidden;
    margin: 0 8px;
    cursor: pointer;
  }

  .writing-goal-bar:hover .writing-goal-label {
    opacity: 1;
  }

  .writing-goal-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .writing-goal-label {
    position: absolute;
    top: -20px;
    left: 50%;
    transform: translateX(-50%);
    white-space: nowrap;
    font-size: 10px;
    font-family: var(--font-sans);
    color: var(--text-muted);
    opacity: 0;
    transition: opacity 0.15s ease;
    pointer-events: none;
  }

  .writing-session-stats {
    display: none;
    font-size: 10px;
    font-family: var(--font-sans);
    color: var(--text-muted);
    margin-left: 4px;
  }

  /* Goal settings modal */
  .goal-settings { min-width: 340px; }
  .goal-summary {
    display: flex;
    gap: 16px;
    margin-bottom: 20px;
  }
  .goal-stat {
    flex: 1;
    text-align: center;
    padding: 12px 8px;
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
  }
  .goal-stat-value {
    font-size: var(--font-size-xl);
    font-weight: 700;
    color: var(--text-primary);
    font-family: var(--font-sans);
  }
  .goal-stat-label {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    margin-top: 2px;
  }
  .goal-section-title {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--text-secondary);
    margin: 16px 0 8px;
  }
  .goal-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
  }
  .goal-label {
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    font-family: var(--font-sans);
  }
  .goal-input {
    width: 100px;
    padding: 5px 10px;
    font-size: var(--font-size-sm);
    font-family: var(--font-sans);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-primary);
    color: var(--text-primary);
    text-align: right;
  }
  .goal-input:focus {
    border-color: var(--accent);
    outline: none;
  }
  .goal-actions {
    margin-top: 16px;
    text-align: right;
  }
  .goal-save-btn {
    padding: 6px 20px;
    font-family: var(--font-sans);
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--accent-text);
    background: var(--accent);
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .goal-save-btn:hover {
    background: var(--accent-hover);
  }

  /* Heatmap */
  .heatmap-container { margin: 8px 0; }
  .heatmap-grid {
    display: flex;
    gap: 3px;
  }
  .heatmap-col {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .heatmap-cell {
    width: 12px;
    height: 12px;
    border-radius: 2px;
    background: var(--bg-tertiary);
    position: relative;
  }
  .heatmap-cell[data-tooltip]:hover::after {
    content: attr(data-tooltip);
    position: absolute;
    bottom: calc(100% + 4px);
    left: 50%;
    transform: translateX(-50%);
    padding: 3px 8px;
    background: var(--text-primary);
    color: var(--bg-primary);
    font-size: 10px;
    font-family: var(--font-sans);
    white-space: nowrap;
    border-radius: var(--radius-sm);
    z-index: 10;
    pointer-events: none;
  }
`);
