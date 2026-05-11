import { el, injectStyles } from '../utils/dom.js';
import { documentStore } from '../store/document-store.js';
import { settingsStore } from '../store/settings-store.js';
import { renderMarkdownToHtml } from '../export/html-export.js';
import { toast } from './toast.js';

let overlay = null;

const TYPOGRAPHER_RULES = [
  // em-dash before en-dash before single-dash to avoid double replacement
  { re: /---/g, to: '—' },
  { re: /--/g, to: '–' },
  { re: /\.\.\./g, to: '…' },
  // Smart double quotes: leading vs trailing
  { re: /(^|[\s(\[{])"/g, to: '$1“' },
  { re: /"/g, to: '”' },
  // Smart single quotes (avoid breaking contractions: apostrophe stays curly right)
  { re: /(^|[\s(\[{])'/g, to: '$1‘' },
  { re: /'/g, to: '’' },
];

function applyTypography(html) {
  // Apply typographer rules to text nodes only — avoid breaking tags/attrs.
  return html.replace(/>([^<]+)</g, (_, text) => {
    let t = text;
    for (const r of TYPOGRAPHER_RULES) t = t.replace(r.re, r.to);
    return `>${t}<`;
  });
}

function deriveTitleAndBody(markdown) {
  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    const title = titleMatch[1].trim();
    const body = markdown.replace(titleMatch[0], '').replace(/^\n+/, '');
    return { title, body };
  }
  const name = documentStore.getFileName().replace(/\.(md|markdown)$/i, '');
  return { title: name || 'Untitled', body: markdown };
}

function close() {
  if (!overlay) return;
  overlay.classList.remove('reader-open');
  document.body.classList.remove('reader-view-active');
  setTimeout(() => {
    overlay?.remove();
    overlay = null;
  }, 220);
}

export function openReaderView() {
  if (overlay) return;

  const markdown = documentStore.getMarkdown() || '';
  const { title, body } = deriveTitleAndBody(markdown);
  const byline = settingsStore.get('authorByline') || '';
  const articleHtml = applyTypography(renderMarkdownToHtml(body));
  const dateStr = new Date().toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const closeBtn = el('button', {
    className: 'reader-close',
    'aria-label': 'Close reader view (Esc)',
    onClick: close,
  }, '×');

  const copyBtn = el('button', {
    className: 'reader-action',
    'aria-label': 'Copy markdown',
    onClick: async () => {
      try {
        await navigator.clipboard.writeText(markdown);
        toast('Markdown copied', 'success');
      } catch {
        toast('Copy failed', 'warning');
      }
    },
  }, 'Copy');

  const article = el('article', {
    className: 'reader-article',
    unsafeHTML: `
      <header class="reader-header">
        <h1 class="reader-title">${escape(title)}</h1>
        <div class="reader-meta">
          ${byline ? `<span class="reader-byline">${escape(byline)}</span>` : ''}
          <span class="reader-date">${escape(dateStr)}</span>
        </div>
      </header>
      <div class="reader-body">${articleHtml}</div>
    `,
  });

  const modal = el('div', { className: 'reader-modal' },
    el('div', { className: 'reader-controls' }, copyBtn, closeBtn),
    article,
  );

  overlay = el('div', { className: 'reader-overlay', role: 'dialog', 'aria-modal': 'true' }, modal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  const onKey = (e) => {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('keydown', onKey);

  document.body.appendChild(overlay);
  document.body.classList.add('reader-view-active');
  requestAnimationFrame(() => overlay.classList.add('reader-open'));
}

function escape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

injectStyles(`
body.reader-view-active .app-toolbar,
body.reader-view-active .app-statusbar,
body.reader-view-active .app-sidebar,
body.reader-view-active .sidebar-resize-handle,
body.reader-view-active .writing-mode-session-stats {
  visibility: hidden !important;
}
.reader-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: var(--bg-primary);
  overflow-y: auto;
  opacity: 0;
  transition: opacity 0.22s ease;
}
.reader-overlay.reader-open { opacity: 1; }
[data-theme="dark"] .reader-overlay { background: #11121a; }
.reader-modal {
  max-width: 720px;
  margin: 0 auto;
  padding: 56px 24px 96px;
  position: relative;
}
.reader-controls {
  position: fixed;
  top: 16px;
  right: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 2;
}
.reader-action,
.reader-close {
  padding: 6px 14px;
  border-radius: 999px;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.reader-action:hover,
.reader-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.reader-close {
  font-size: 18px;
  padding: 2px 12px;
  line-height: 1.2;
}
.reader-article {
  font-family: 'Charter', 'Iowan Old Style', 'Georgia', 'Spectral', serif;
  color: var(--text-primary);
  line-height: 1.7;
  font-size: 19px;
}
[data-theme="dark"] .reader-article { color: #e8e8ee; }
.reader-header { margin-bottom: 40px; }
.reader-title {
  font-family: 'Charter', 'Iowan Old Style', 'Georgia', serif;
  font-size: 40px;
  font-weight: 700;
  line-height: 1.18;
  letter-spacing: -0.012em;
  margin: 0 0 14px;
}
.reader-meta {
  display: flex;
  gap: 12px;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
}
.reader-meta .reader-byline { color: var(--text-secondary); font-weight: 500; }
.reader-meta .reader-byline + .reader-date::before {
  content: "·";
  margin-right: 12px;
}
.reader-body > p:first-of-type {
  overflow: hidden;
  min-height: 1.2em;
}
.reader-body > p:first-of-type::first-letter {
  font-family: 'Charter', 'Iowan Old Style', 'Georgia', serif;
  font-size: 4.2em;
  float: left;
  line-height: 0.86;
  margin: 0.08em 0.08em 0 -0.04em;
  font-weight: 700;
  color: var(--accent, var(--text-primary));
}
.reader-body > h1,
.reader-body > h2,
.reader-body > h3 { clear: left; }
.reader-body h1, .reader-body h2, .reader-body h3 {
  font-family: 'Charter', 'Iowan Old Style', 'Georgia', serif;
  font-weight: 700;
  letter-spacing: -0.005em;
  line-height: 1.25;
  margin-top: 1.6em;
}
.reader-body h1 { font-size: 30px; }
.reader-body h2 { font-size: 24px; }
.reader-body h3 { font-size: 20px; }
.reader-body p { margin: 1em 0; }
.reader-body a { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; }
.reader-body blockquote {
  border-left: 3px solid var(--accent, #999);
  padding: 0 0 0 20px;
  margin: 1.4em 0;
  color: var(--text-secondary);
  font-style: italic;
}
.reader-body pre {
  font-family: var(--font-mono);
  background: var(--bg-tertiary);
  padding: 14px 18px;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 15px;
  line-height: 1.55;
}
.reader-body code {
  font-family: var(--font-mono);
  background: var(--bg-tertiary);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.92em;
}
.reader-body pre code { background: none; padding: 0; }
.reader-body img { max-width: 100%; height: auto; border-radius: 4px; margin: 1.4em 0; }
.reader-body table { border-collapse: collapse; width: 100%; margin: 1.4em 0; font-family: var(--font-sans); font-size: 15px; }
.reader-body th, .reader-body td { border-bottom: 1px solid var(--border-light); padding: 8px 12px; text-align: left; }
.reader-body th { font-weight: 600; }
.reader-body hr { border: none; border-top: 1px solid var(--border-light); margin: 2.4em 0; }
@media (max-width: 640px) {
  .reader-modal { padding: 56px 18px 80px; }
  .reader-title { font-size: 30px; }
  .reader-article { font-size: 17px; }
  .reader-body > p:first-of-type::first-letter { font-size: 3.4em; }
}
`);
