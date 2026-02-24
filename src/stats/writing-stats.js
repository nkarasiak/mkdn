import { el } from '../utils/dom.js';
import { documentStore } from '../store/document-store.js';
import { eventBus } from '../store/event-bus.js';
import { settingsStore } from '../store/settings-store.js';

const STORAGE_KEY = 'mkdn-writing-stats';

// Session timer
let sessionStartTime = Date.now();
let sessionWordStart = 0;

function loadStats() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : { dailyWords: {}, streak: 0, lastWriteDate: null, goalDaily: 500 };
  } catch {
    return { dailyWords: {}, streak: 0, lastWriteDate: null, goalDaily: 500 };
  }
}

function saveStats(stats) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch { /* quota exceeded */ }
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getWordCount(md) {
  if (!md) return 0;
  const text = md.replace(/[#*_`~\[\]()>|\\-]/g, ' ').trim();
  return text ? text.split(/\s+/).length : 0;
}

function getCharCount(md) {
  if (!md) return 0;
  return md.replace(/\s/g, '').length;
}

function getSentenceCount(md) {
  if (!md) return 0;
  const matches = md.match(/[.!?]+\s/g);
  return matches ? matches.length : 0;
}

function getParagraphCount(md) {
  if (!md) return 0;
  const paras = md.split(/\n\s*\n/).filter(p => p.trim());
  return paras.length;
}

/**
 * Flesch-Kincaid Reading Ease score.
 * Higher = easier to read (60-70 = standard, 80+ = easy).
 */
function fleschKincaid(md) {
  if (!md) return 0;
  const text = md.replace(/[#*_`~\[\]()>|\\-]/g, ' ').trim();
  const words = text.split(/\s+/).filter(Boolean);
  const sentences = (text.match(/[.!?]+/g) || []).length || 1;
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);

  if (words.length === 0) return 0;
  const score = 206.835 - 1.015 * (words.length / sentences) - 84.6 * (syllables / words.length);
  return Math.max(0, Math.min(100, Math.round(score)));
}

function countSyllables(word) {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word.replace(/^y/, '');
  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

function getReadingLevel(score) {
  if (score >= 90) return 'Very Easy';
  if (score >= 80) return 'Easy';
  if (score >= 70) return 'Fairly Easy';
  if (score >= 60) return 'Standard';
  if (score >= 50) return 'Fairly Hard';
  if (score >= 30) return 'Hard';
  return 'Very Hard';
}

function formatDuration(ms) {
  const mins = Math.floor(ms / 60000);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) return `${hrs}h ${mins % 60}m`;
  return `${mins}m`;
}

function updateDailyWords() {
  const stats = loadStats();
  const today = todayKey();
  const currentWords = getWordCount(documentStore.getMarkdown());

  // Track words written today
  if (!stats.dailyWords[today]) {
    stats.dailyWords[today] = 0;
    sessionWordStart = currentWords;
  }

  const wordsWritten = Math.max(0, currentWords - sessionWordStart);
  stats.dailyWords[today] = Math.max(stats.dailyWords[today], wordsWritten);

  // Update streak
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (stats.lastWriteDate === yesterday || stats.lastWriteDate === today) {
    if (stats.dailyWords[today] > 0) {
      stats.lastWriteDate = today;
    }
  } else if (stats.dailyWords[today] > 0) {
    stats.streak = stats.lastWriteDate === yesterday ? stats.streak + 1 : 1;
    stats.lastWriteDate = today;
  }

  // Clean old entries (keep last 30 days)
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  for (const key of Object.keys(stats.dailyWords)) {
    if (key < cutoff) delete stats.dailyWords[key];
  }

  saveStats(stats);
}

export function openWritingStats() {
  updateDailyWords();
  const stats = loadStats();
  const md = documentStore.getMarkdown();
  const words = getWordCount(md);
  const chars = getCharCount(md);
  const sentences = getSentenceCount(md);
  const paragraphs = getParagraphCount(md);
  const readTime = Math.max(1, Math.ceil(words / 200));
  const fk = fleschKincaid(md);
  const level = getReadingLevel(fk);
  const sessionDuration = formatDuration(Date.now() - sessionStartTime);
  const today = todayKey();
  const todayWords = stats.dailyWords[today] || 0;
  const goalDaily = stats.goalDaily || 500;
  const goalPercent = Math.min(100, Math.round((todayWords / goalDaily) * 100));

  // Build the stats panel
  const content = el('div', { className: 'writing-stats' },
    el('div', { className: 'stats-grid' },
      statCard('Words', words.toLocaleString()),
      statCard('Characters', chars.toLocaleString()),
      statCard('Sentences', sentences.toLocaleString()),
      statCard('Paragraphs', paragraphs.toLocaleString()),
      statCard('Read time', `${readTime} min`),
      statCard('Session', sessionDuration),
    ),
    el('div', { className: 'stats-section' },
      el('h4', { className: 'stats-section-title' }, 'Readability'),
      el('div', { className: 'stats-readability' },
        el('div', { className: 'stats-score' },
          el('span', { className: 'stats-score-number' }, String(fk)),
          el('span', { className: 'stats-score-label' }, 'Flesch-Kincaid'),
        ),
        el('div', { className: 'stats-level' }, level),
      ),
    ),
    el('div', { className: 'stats-section' },
      el('h4', { className: 'stats-section-title' }, 'Daily Goal'),
      el('div', { className: 'stats-goal' },
        el('div', { className: 'stats-goal-bar' },
          el('div', { className: 'stats-goal-fill', style: { width: `${goalPercent}%` } }),
        ),
        el('div', { className: 'stats-goal-text' },
          `${todayWords} / ${goalDaily} words (${goalPercent}%)`,
        ),
      ),
      el('div', { className: 'stats-goal-input' },
        el('label', {}, 'Daily goal: '),
        (() => {
          const input = el('input', {
            type: 'number',
            value: String(goalDaily),
            min: '50',
            max: '10000',
            style: { width: '80px' },
          });
          input.addEventListener('change', () => {
            const val = parseInt(input.value, 10);
            if (val > 0) {
              const s = loadStats();
              s.goalDaily = val;
              saveStats(s);
            }
          });
          return input;
        })(),
      ),
    ),
    el('div', { className: 'stats-section' },
      el('h4', { className: 'stats-section-title' }, 'Streak'),
      el('div', { className: 'stats-streak' },
        el('span', { className: 'stats-streak-number' }, String(stats.streak || 0)),
        el('span', { className: 'stats-streak-label' }, stats.streak === 1 ? 'day' : 'days'),
      ),
    ),
  );

  import('../ui/modal.js').then(({ showInfo }) => showInfo('Writing Statistics', content));
}

export function initWritingStats() {
  sessionStartTime = Date.now();
  sessionWordStart = getWordCount(documentStore.getMarkdown());

  // Periodically update daily words
  eventBus.on('content:changed', () => updateDailyWords());
}

// Inject styles
const style = document.createElement('style');
style.textContent = `
  .writing-stats {
    min-width: 320px;
  }
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 20px;
  }
  .stat-card {
    text-align: center;
    padding: 12px 8px;
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
  }
  .stat-card-value {
    font-size: var(--font-size-xl);
    font-weight: 700;
    color: var(--text-primary);
    font-family: var(--font-sans);
  }
  .stat-card-label {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    margin-top: 2px;
  }
  .stats-section {
    margin-bottom: 16px;
  }
  .stats-section-title {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 8px;
  }
  .stats-readability {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .stats-score {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .stats-score-number {
    font-size: 28px;
    font-weight: 700;
    color: var(--accent);
    font-family: var(--font-sans);
  }
  .stats-score-label {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
  }
  .stats-level {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    font-weight: 500;
  }
  .stats-goal-bar {
    height: 8px;
    background: var(--bg-tertiary);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 6px;
  }
  .stats-goal-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 4px;
    transition: width 0.3s ease;
  }
  .stats-goal-text {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    margin-bottom: 8px;
  }
  .stats-goal-input {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }
  .stats-goal-input input {
    padding: 4px 8px;
    font-size: var(--font-size-sm);
  }
  .stats-streak {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .stats-streak-number {
    font-size: 36px;
    font-weight: 700;
    color: var(--accent);
    font-family: var(--font-sans);
  }
  .stats-streak-label {
    font-size: var(--font-size-sm);
    color: var(--text-muted);
  }
`;
document.head.appendChild(style);

function statCard(label, value) {
  return el('div', { className: 'stat-card' },
    el('div', { className: 'stat-card-value' }, value),
    el('div', { className: 'stat-card-label' }, label),
  );
}
