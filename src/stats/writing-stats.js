import { el, injectStyles } from '../utils/dom.js';
import { documentStore } from '../store/document-store.js';

// Session timer
let sessionStartTime = Date.now();
let sessionWordStart = 0;

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

function updateSessionWords() {
  const currentWords = getWordCount(documentStore.getMarkdown());
  if (sessionWordStart === 0) {
    sessionWordStart = currentWords;
  }
}

export function openWritingStats() {
  updateSessionWords();
  const md = documentStore.getMarkdown();
  const words = getWordCount(md);
  const chars = getCharCount(md);
  const sentences = getSentenceCount(md);
  const paragraphs = getParagraphCount(md);
  const readTime = Math.max(1, Math.ceil(words / 200));
  const fk = fleschKincaid(md);
  const level = getReadingLevel(fk);
  const sessionDuration = formatDuration(Date.now() - sessionStartTime);

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
  );

  import('../ui/modal.js').then(({ showInfo }) => showInfo('Writing Statistics', content));
}

export function initWritingStats() {
  sessionStartTime = Date.now();
  sessionWordStart = getWordCount(documentStore.getMarkdown());
}

// Inject styles
injectStyles(`
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
`);

function statCard(label, value) {
  return el('div', { className: 'stat-card' },
    el('div', { className: 'stat-card-value' }, value),
    el('div', { className: 'stat-card-label' }, label),
  );
}
