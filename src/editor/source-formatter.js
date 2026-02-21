/**
 * Textarea formatting utilities for source mode.
 * Provides markdown formatting operations that work directly on a <textarea>.
 */

let textarea = null;

export function setSourceTextarea(el) {
  textarea = el;
}

export function getSourceTextarea() {
  return textarea;
}

// --- Low-level helpers ---

/** Wrap the current selection with before/after strings (e.g. **bold**). */
function wrapSelection(ta, before, after) {
  if (!ta) return;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const selected = ta.value.substring(start, end);

  // If already wrapped, unwrap
  const textBefore = ta.value.substring(Math.max(0, start - before.length), start);
  const textAfter = ta.value.substring(end, end + after.length);
  if (textBefore === before && textAfter === after) {
    ta.setSelectionRange(start - before.length, end + after.length);
    ta.setRangeText(selected);
    ta.setSelectionRange(start - before.length, end - before.length);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  ta.setRangeText(before + selected + after, start, end, 'select');
  // Place cursor: if no selection, put between markers; if selection, select the wrapped text
  if (start === end) {
    ta.setSelectionRange(start + before.length, start + before.length);
  } else {
    ta.setSelectionRange(start + before.length, end + before.length);
  }
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Strip any list prefix (bullet or ordered) from a line. */
function stripListPrefix(line) {
  return line.replace(/^(\*|-|\d+\.)\s+/, '');
}

/** Toggle a line prefix (e.g. `- `, `> `) on all selected lines. */
function toggleLinePrefix(ta, prefix) {
  if (!ta) return;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const value = ta.value;

  // Find line boundaries
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = value.indexOf('\n', end);
  const blockEnd = lineEnd === -1 ? value.length : lineEnd;

  const block = value.substring(lineStart, blockEnd);
  const lines = block.split('\n');
  const nonEmpty = lines.filter(l => l.trim() !== '');
  const allPrefixed = nonEmpty.length > 0 && nonEmpty.every(l => l.startsWith(prefix));

  const newLines = allPrefixed
    ? lines.map(l => l.trim() === '' ? l : l.substring(prefix.length))
    : lines.map(l => l.trim() === '' ? l : prefix + stripListPrefix(l));

  const newBlock = newLines.join('\n');
  ta.setSelectionRange(lineStart, blockEnd);
  ta.setRangeText(newBlock);
  ta.setSelectionRange(lineStart, lineStart + newBlock.length);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Set heading level on the current line (0 = remove heading). */
function setHeadingLevel(ta, level) {
  if (!ta) return;
  const start = ta.selectionStart;
  const value = ta.value;

  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = value.indexOf('\n', start);
  const end = lineEnd === -1 ? value.length : lineEnd;

  const line = value.substring(lineStart, end);
  // Strip existing heading prefix
  const stripped = line.replace(/^#{1,6}\s*/, '');

  const newLine = level > 0 ? '#'.repeat(level) + ' ' + stripped : stripped;
  ta.setSelectionRange(lineStart, end);
  ta.setRangeText(newLine);
  ta.setSelectionRange(lineStart + newLine.length, lineStart + newLine.length);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Insert a block-level element at cursor, ensuring blank lines around it. */
function insertBlock(ta, text) {
  if (!ta) return;
  const start = ta.selectionStart;
  const value = ta.value;

  // Ensure blank line before if not at start
  let prefix = '';
  if (start > 0 && value[start - 1] !== '\n') prefix = '\n';
  if (start > 1 && value[start - 2] !== '\n') prefix = '\n\n';

  // Ensure blank line after
  const suffix = '\n\n';

  const insertion = prefix + text + suffix;
  ta.setRangeText(insertion, start, start, 'end');
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Toggle ordered list with auto-numbering on selected lines. */
function toggleOrderedList(ta) {
  if (!ta) return;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const value = ta.value;

  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = value.indexOf('\n', end);
  const blockEnd = lineEnd === -1 ? value.length : lineEnd;

  const block = value.substring(lineStart, blockEnd);
  const lines = block.split('\n');
  const nonEmpty = lines.filter(l => l.trim() !== '');
  const allNumbered = nonEmpty.length > 0 && nonEmpty.every(l => /^\d+\.\s/.test(l));

  let num = 0;
  const newLines = allNumbered
    ? lines.map(l => l.trim() === '' ? l : l.replace(/^\d+\.\s+/, ''))
    : lines.map(l => {
        if (l.trim() === '') return l;
        num++;
        return `${num}. ${stripListPrefix(l)}`;
      });

  const newBlock = newLines.join('\n');
  ta.setSelectionRange(lineStart, blockEnd);
  ta.setRangeText(newBlock);
  ta.setSelectionRange(lineStart, lineStart + newBlock.length);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

// --- Public API ---

export const sourceFormat = {
  bold() {
    wrapSelection(textarea, '**', '**');
  },
  italic() {
    wrapSelection(textarea, '*', '*');
  },
  strikethrough() {
    wrapSelection(textarea, '~~', '~~');
  },
  inlineCode() {
    wrapSelection(textarea, '`', '`');
  },
  heading(level) {
    setHeadingLevel(textarea, level);
  },
  bulletList() {
    toggleLinePrefix(textarea, '* ');
  },
  orderedList() {
    toggleOrderedList(textarea);
  },
  blockquote() {
    toggleLinePrefix(textarea, '> ');
  },
  link() {
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end);
    const linkText = selected || 'link text';
    const md = `[${linkText}](url)`;
    textarea.setRangeText(md, start, end, 'end');
    // Select "url" for easy replacement
    const urlStart = start + linkText.length + 3; // [text](
    textarea.setSelectionRange(urlStart, urlStart + 3);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  },
  hr() {
    insertBlock(textarea, '---');
  },
  codeBlock() {
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end);
    const block = '```\n' + selected + '\n```';
    insertBlock(textarea, block);
  },
  table(rows = 3, cols = 3) {
    if (!textarea) return;
    const headerCells = Array.from({ length: cols }, (_, i) => `Header ${i + 1}`);
    const separators = Array.from({ length: cols }, () => '---');
    const emptyCells = Array.from({ length: cols }, () => '   ');

    const lines = [
      '| ' + headerCells.join(' | ') + ' |',
      '| ' + separators.join(' | ') + ' |',
    ];
    for (let r = 0; r < rows - 1; r++) {
      lines.push('| ' + emptyCells.join(' | ') + ' |');
    }
    insertBlock(textarea, lines.join('\n'));
  },
  insertLink(text, url) {
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const md = `[${text}](${url})`;
    textarea.setRangeText(md, start, end, 'end');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  },
};
