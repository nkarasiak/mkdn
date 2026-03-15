import { el, injectStyles } from '../utils/dom.js';
import { localSync } from '../local/local-sync.js';
import { eventBus } from '../store/event-bus.js';
import { toast } from '../ui/toast.js';

let splitOpen = false;
let secondaryPane = null;
let dividerEl = null;
let currentFilePath = null;

// ─── Lightweight Markdown → HTML renderer ───────────────────────────
function renderMarkdown(md) {
  if (!md) return '';

  // Escape HTML entities
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const lines = md.split('\n');
  const html = [];
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeLines = [];
  let inList = false;
  let listType = '';

  function closeList() {
    if (inList) {
      html.push(listType === 'ol' ? '</ol>' : '</ul>');
      inList = false;
      listType = '';
    }
  }

  function inlineFormat(text) {
    let s = esc(text);
    // Images: ![alt](url)
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%">');
    // Links: [text](url)
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // Wikilinks: [[page]]
    s = s.replace(/\[\[([^\]]+)\]\]/g, '<span class="split-wikilink">$1</span>');
    // Bold+italic: ***text*** or ___text___
    s = s.replace(/\*{3}(.+?)\*{3}/g, '<strong><em>$1</em></strong>');
    s = s.replace(/_{3}(.+?)_{3}/g, '<strong><em>$1</em></strong>');
    // Bold: **text** or __text__
    s = s.replace(/\*{2}(.+?)\*{2}/g, '<strong>$1</strong>');
    s = s.replace(/_{2}(.+?)_{2}/g, '<strong>$1</strong>');
    // Italic: *text* or _text_
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    s = s.replace(/(?<!\w)_(.+?)_(?!\w)/g, '<em>$1</em>');
    // Strikethrough: ~~text~~
    s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');
    // Inline code: `code`
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    return s;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block toggle
    if (line.trimStart().startsWith('```')) {
      if (!inCodeBlock) {
        closeList();
        inCodeBlock = true;
        codeBlockLang = line.trimStart().slice(3).trim();
        codeLines = [];
        continue;
      } else {
        html.push(`<pre><code class="language-${esc(codeBlockLang)}">${codeLines.map(esc).join('\n')}</code></pre>`);
        inCodeBlock = false;
        continue;
      }
    }
    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Blank line
    if (line.trim() === '') {
      closeList();
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      closeList();
      const level = headingMatch[1].length;
      html.push(`<h${level}>${inlineFormat(headingMatch[2])}</h${level}>`);
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      closeList();
      html.push('<hr>');
      continue;
    }

    // Blockquote
    if (line.trimStart().startsWith('> ')) {
      closeList();
      html.push(`<blockquote><p>${inlineFormat(line.replace(/^>\s*/, ''))}</p></blockquote>`);
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)/);
    if (ulMatch) {
      if (!inList || listType !== 'ul') {
        closeList();
        html.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      html.push(`<li>${inlineFormat(ulMatch[2])}</li>`);
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^(\s*)\d+\.\s+(.+)/);
    if (olMatch) {
      if (!inList || listType !== 'ol') {
        closeList();
        html.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      html.push(`<li>${inlineFormat(olMatch[2])}</li>`);
      continue;
    }

    // Task list items (checkbox)
    const taskMatch = line.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.+)/);
    if (taskMatch) {
      if (!inList || listType !== 'ul') {
        closeList();
        html.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      const checked = taskMatch[2] !== ' ' ? ' checked disabled' : ' disabled';
      html.push(`<li><input type="checkbox"${checked}> ${inlineFormat(taskMatch[3])}</li>`);
      continue;
    }

    // Paragraph
    closeList();
    html.push(`<p>${inlineFormat(line)}</p>`);
  }

  // Close any dangling blocks
  if (inCodeBlock) {
    html.push(`<pre><code>${codeLines.map(esc).join('\n')}</code></pre>`);
  }
  closeList();

  return html.join('\n');
}

// ─── Split Pane DOM ─────────────────────────────────────────────────
function createSecondaryPane() {
  const fileSelect = el('select', { className: 'split-file-select' });
  fileSelect.addEventListener('change', () => {
    if (fileSelect.value) loadFile(fileSelect.value);
  });

  const closeBtn = el('button', {
    className: 'split-close-btn',
    title: 'Close split pane',
    unsafeHTML: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    onClick: closeSplitPane,
  });

  const toolbar = el('div', { className: 'split-toolbar' }, fileSelect, closeBtn);

  const content = el('div', { className: 'split-content' });

  const pane = el('div', { className: 'split-pane-secondary' }, toolbar, content);
  pane._fileSelect = fileSelect;
  pane._content = content;

  return pane;
}

function createDivider() {
  const div = el('div', { className: 'split-divider' });

  let startX = 0;
  let startLeftFr = 0.5;

  function onMouseMove(e) {
    const main = div.parentElement;
    if (!main) return;
    const rect = main.getBoundingClientRect();
    const fraction = (e.clientX - rect.left) / rect.width;
    const clamped = Math.min(Math.max(0.2, fraction), 0.8);
    main.style.gridTemplateColumns = `${clamped}fr 5px ${1 - clamped}fr`;
  }

  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.body.classList.remove('split-resizing');
    div.classList.remove('active');
  }

  div.addEventListener('mousedown', (e) => {
    e.preventDefault();
    document.body.classList.add('split-resizing');
    div.classList.add('active');
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  return div;
}

function populateFileSelect(selectEl) {
  const files = localSync.getFiles();
  // Clear existing options
  selectEl.innerHTML = '';
  selectEl.appendChild(el('option', { value: '' }, files.length ? 'Select a file...' : 'No folder linked'));

  for (const f of files) {
    const opt = el('option', { value: f.path }, f.path);
    if (f.path === currentFilePath) opt.selected = true;
    selectEl.appendChild(opt);
  }
}

async function loadFile(filePath) {
  currentFilePath = filePath;
  const content = await localSync.readFileContent(filePath);
  if (content === null) {
    toast('Could not read file', 'error');
    return;
  }

  if (secondaryPane) {
    const rendered = renderMarkdown(content);
    secondaryPane._content.innerHTML = rendered;
    secondaryPane._content.scrollTop = 0;
  }
}

// ─── Public API ─────────────────────────────────────────────────────
export function openSplitPane(filePath) {
  if (splitOpen) {
    // Already open — just switch file if provided
    if (filePath) loadFile(filePath);
    return;
  }

  const main = document.querySelector('.app-main');
  if (!main) return;

  // Create elements
  dividerEl = createDivider();
  secondaryPane = createSecondaryPane();

  // Insert into .app-main
  main.appendChild(dividerEl);
  main.appendChild(secondaryPane);
  main.classList.add('split-active');

  // Populate file list
  populateFileSelect(secondaryPane._fileSelect);

  // Listen for file list updates
  eventBus.on('local:files-updated', onFilesUpdated);

  splitOpen = true;

  if (filePath) {
    loadFile(filePath);
    secondaryPane._fileSelect.value = filePath;
  }
}

export function closeSplitPane() {
  if (!splitOpen) return;

  const main = document.querySelector('.app-main');
  if (!main) return;

  if (dividerEl) { dividerEl.remove(); dividerEl = null; }
  if (secondaryPane) { secondaryPane.remove(); secondaryPane = null; }

  main.classList.remove('split-active');
  main.style.gridTemplateColumns = '';
  currentFilePath = null;

  eventBus.off('local:files-updated', onFilesUpdated);

  splitOpen = false;
}

export function toggleSplitPane() {
  if (splitOpen) {
    closeSplitPane();
  } else {
    openSplitPane();
  }
}

export function isSplitOpen() {
  return splitOpen;
}

function onFilesUpdated() {
  if (secondaryPane) {
    populateFileSelect(secondaryPane._fileSelect);
  }
}

// ─── Styles ─────────────────────────────────────────────────────────
injectStyles(/* css */`
  /* Split active layout — switch from flex to grid */
  .app-main.split-active {
    display: grid;
    grid-template-columns: 1fr 5px 1fr;
  }

  .app-main.split-active .editor-pane {
    min-width: 0;
    overflow: hidden auto;
  }

  .app-main.split-active .source-editor-wrapper {
    min-width: 0;
  }

  /* Divider */
  .split-divider {
    width: 5px;
    cursor: col-resize;
    background: var(--border);
    position: relative;
    z-index: 2;
    transition: background 0.15s ease;
  }

  .split-divider::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: -3px;
    width: 11px;
  }

  .split-divider:hover,
  .split-divider.active {
    background: var(--accent);
  }

  body.split-resizing {
    cursor: col-resize !important;
    user-select: none !important;
  }

  body.split-resizing * {
    cursor: col-resize !important;
  }

  /* Secondary pane */
  .split-pane-secondary {
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
    background: var(--editor-bg);
    border-left: 1px solid var(--border);
  }

  .split-toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-secondary, var(--bg));
    flex-shrink: 0;
  }

  .split-file-select {
    flex: 1;
    min-width: 0;
    padding: 4px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    color: var(--text-primary);
    font-family: var(--font-sans);
    font-size: var(--font-size-sm);
    cursor: pointer;
  }

  .split-file-select:focus {
    outline: none;
    border-color: var(--accent);
  }

  .split-close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    flex-shrink: 0;
  }

  .split-close-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  /* Content area — reuse editor-like styling */
  .split-content {
    flex: 1;
    overflow: auto;
    padding: 24px 48px;
    font-family: var(--font-serif, Georgia, serif);
    font-size: var(--font-size-base, 15px);
    line-height: 1.75;
    color: var(--text-primary);
    max-width: 100%;
  }

  .split-content h1,
  .split-content h2,
  .split-content h3,
  .split-content h4,
  .split-content h5,
  .split-content h6 {
    font-family: var(--font-sans);
    font-weight: 700;
    line-height: 1.3;
    margin: 1.5em 0 0.5em;
    color: var(--text-primary);
  }

  .split-content h1 { font-size: 1.8em; }
  .split-content h2 { font-size: 1.4em; }
  .split-content h3 { font-size: 1.15em; }

  .split-content p {
    margin: 0 0 1em;
  }

  .split-content a {
    color: var(--accent);
    text-decoration: underline;
  }

  .split-content code {
    background: var(--bg-hover, rgba(0,0,0,0.06));
    padding: 2px 5px;
    border-radius: 3px;
    font-family: var(--font-mono, 'SF Mono', monospace);
    font-size: 0.88em;
  }

  .split-content pre {
    background: var(--bg-secondary, #f5f5f5);
    padding: 12px 16px;
    border-radius: var(--radius-md, 6px);
    overflow-x: auto;
    margin: 0 0 1em;
  }

  .split-content pre code {
    background: none;
    padding: 0;
    font-size: 0.85em;
  }

  .split-content blockquote {
    border-left: 3px solid var(--accent);
    margin: 0 0 1em;
    padding: 4px 16px;
    color: var(--text-secondary);
  }

  .split-content ul,
  .split-content ol {
    margin: 0 0 1em;
    padding-left: 1.5em;
  }

  .split-content li {
    margin-bottom: 0.25em;
  }

  .split-content hr {
    border: none;
    border-top: 1px solid var(--border);
    margin: 1.5em 0;
  }

  .split-content img {
    max-width: 100%;
    border-radius: var(--radius-md, 6px);
  }

  .split-content strong { font-weight: 700; }
  .split-content em { font-style: italic; }
  .split-content del { text-decoration: line-through; opacity: 0.6; }

  .split-wikilink {
    color: var(--accent);
    font-weight: 500;
    cursor: pointer;
  }

  /* Empty state */
  .split-content:empty::after {
    content: 'Select a file to preview';
    display: block;
    text-align: center;
    padding-top: 40%;
    color: var(--text-muted);
    font-family: var(--font-sans);
    font-size: var(--font-size-sm);
  }

  /* Zen mode — hide split pane */
  .app.zen .split-pane-secondary,
  .app.zen .split-divider {
    display: none;
  }

  /* Mobile — stack vertically */
  @media (max-width: 768px) {
    .app-main.split-active {
      grid-template-columns: 1fr;
      grid-template-rows: 1fr 5px 1fr;
    }

    .split-divider {
      width: auto;
      height: 5px;
      cursor: row-resize;
    }

    .split-pane-secondary {
      border-left: none;
      border-top: 1px solid var(--border);
    }

    .split-content {
      padding: 16px 20px;
    }
  }
`);
