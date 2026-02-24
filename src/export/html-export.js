import { documentStore } from '../store/document-store.js';
import { toast } from '../ui/toast.js';

const themes = {
  minimal: {
    name: 'Minimal',
    css: `
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; line-height: 1.7; color: #1a1a1a; }
      h1, h2, h3 { font-weight: 600; line-height: 1.3; margin-top: 2em; }
      h1 { font-size: 2em; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
      code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
      pre { background: #f5f5f5; padding: 16px; border-radius: 6px; overflow-x: auto; }
      pre code { background: none; padding: 0; }
      blockquote { border-left: 3px solid #ddd; margin-left: 0; padding-left: 16px; color: #666; }
      img { max-width: 100%; height: auto; }
      table { border-collapse: collapse; width: 100%; margin: 1em 0; }
      th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
      th { background: #f5f5f5; font-weight: 600; }
      a { color: #0366d6; }
      hr { border: none; border-top: 1px solid #eee; margin: 2em 0; }
    `,
  },
  academic: {
    name: 'Academic',
    css: `
      body { font-family: 'Georgia', 'Times New Roman', serif; max-width: 680px; margin: 60px auto; padding: 0 24px; line-height: 1.8; color: #222; font-size: 17px; }
      h1 { font-size: 1.8em; text-align: center; margin: 1.5em 0 0.5em; }
      h2 { font-size: 1.4em; margin-top: 2em; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
      h3 { font-size: 1.2em; margin-top: 1.5em; }
      code { font-family: 'Courier New', monospace; background: #f4f4f4; padding: 2px 5px; font-size: 0.85em; }
      pre { background: #f4f4f4; padding: 16px; border: 1px solid #ddd; overflow-x: auto; font-size: 0.85em; }
      pre code { background: none; padding: 0; }
      blockquote { border-left: 3px solid #999; margin-left: 0; padding-left: 20px; font-style: italic; color: #555; }
      img { max-width: 100%; height: auto; display: block; margin: 1em auto; }
      table { border-collapse: collapse; width: 100%; margin: 1.5em 0; }
      th, td { border: 1px solid #aaa; padding: 10px 14px; }
      th { background: #eee; font-weight: 700; }
      a { color: #1a0dab; }
      hr { border: none; border-top: 1px solid #ccc; margin: 2em 0; }
      p { text-align: justify; }
    `,
  },
  newspaper: {
    name: 'Newspaper',
    css: `
      body { font-family: 'Georgia', serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #111; column-count: 1; }
      h1 { font-size: 2.4em; font-weight: 900; text-align: center; border-top: 4px double #111; border-bottom: 4px double #111; padding: 12px 0; margin: 20px 0; text-transform: uppercase; letter-spacing: 2px; }
      h2 { font-size: 1.5em; font-weight: 700; margin-top: 1.5em; }
      h3 { font-size: 1.2em; font-weight: 700; font-style: italic; }
      p:first-of-type::first-letter { font-size: 3em; float: left; line-height: 1; margin-right: 8px; font-weight: 700; }
      code { font-family: monospace; background: #eee; padding: 2px 4px; }
      pre { background: #f5f5f5; padding: 12px; border: 1px solid #ccc; overflow-x: auto; }
      pre code { background: none; padding: 0; }
      blockquote { border-left: 3px solid #333; margin-left: 0; padding-left: 16px; font-style: italic; }
      img { max-width: 100%; height: auto; }
      table { border-collapse: collapse; width: 100%; margin: 1em 0; }
      th, td { border: 1px solid #333; padding: 6px 10px; }
      th { background: #eee; }
      hr { border: none; border-top: 2px solid #111; margin: 1.5em 0; }
    `,
  },
  dark: {
    name: 'Dark',
    css: `
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; line-height: 1.7; color: #e0e0e0; background: #1a1a2e; }
      h1, h2, h3 { font-weight: 600; line-height: 1.3; margin-top: 2em; color: #fff; }
      h1 { font-size: 2em; border-bottom: 1px solid #333; padding-bottom: 0.3em; }
      code { background: #2a2a40; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; color: #ff79c6; }
      pre { background: #2a2a40; padding: 16px; border-radius: 6px; overflow-x: auto; }
      pre code { background: none; padding: 0; color: #e0e0e0; }
      blockquote { border-left: 3px solid #555; margin-left: 0; padding-left: 16px; color: #aaa; }
      img { max-width: 100%; height: auto; }
      table { border-collapse: collapse; width: 100%; margin: 1em 0; }
      th, td { border: 1px solid #444; padding: 8px 12px; }
      th { background: #2a2a40; font-weight: 600; }
      a { color: #82aaff; }
      hr { border: none; border-top: 1px solid #333; margin: 2em 0; }
    `,
  },
};

function markdownToHtml(markdown) {
  // Simple markdown-to-HTML converter for export
  // Handles: headings, bold, italic, code, links, images, lists, blockquotes, tables, hr
  let html = markdown;

  // Escape HTML entities (but preserve markdown)
  // We'll process block by block
  const lines = html.split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code blocks
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(escapeHtml(lines[i]));
        i++;
      }
      i++; // skip closing ```
      blocks.push(`<pre><code${lang ? ` class="language-${lang}"` : ''}>${codeLines.join('\n')}</code></pre>`);
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      blocks.push('');
      i++;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      blocks.push(`<h${level}>${inlineFormat(headingMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // HR
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push('<hr>');
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const quoteLines = [];
      while (i < lines.length && (lines[i].startsWith('> ') || lines[i].startsWith('>'))) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      blocks.push(`<blockquote><p>${inlineFormat(quoteLines.join(' '))}</p></blockquote>`);
      continue;
    }

    // Unordered list
    if (/^[-*+]\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        items.push(`<li>${inlineFormat(lines[i].replace(/^[-*+]\s/, ''))}</li>`);
        i++;
      }
      blocks.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(`<li>${inlineFormat(lines[i].replace(/^\d+\.\s/, ''))}</li>`);
        i++;
      }
      blocks.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    // Table
    if (line.includes('|') && i + 1 < lines.length && /^\|?\s*[-:]+/.test(lines[i + 1])) {
      const headerCells = line.split('|').filter(c => c.trim()).map(c => `<th>${inlineFormat(c.trim())}</th>`);
      i += 2; // skip header + separator
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        const cells = lines[i].split('|').filter(c => c.trim()).map(c => `<td>${inlineFormat(c.trim())}</td>`);
        rows.push(`<tr>${cells.join('')}</tr>`);
        i++;
      }
      blocks.push(`<table><thead><tr>${headerCells.join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`);
      continue;
    }

    // Paragraph (collect consecutive non-empty lines)
    const paraLines = [];
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('#') && !lines[i].startsWith('```') && !/^[-*+]\s/.test(lines[i]) && !/^\d+\.\s/.test(lines[i]) && !lines[i].startsWith('> ') && !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim())) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length) {
      blocks.push(`<p>${inlineFormat(paraLines.join(' '))}</p>`);
    }
  }

  return blocks.filter(b => b !== '').join('\n');
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineFormat(text) {
  let result = escapeHtml(text);
  // Images (before links)
  result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
  // Links
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  // Bold + Italic
  result = result.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Bold
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/__(.+?)__/g, '<strong>$1</strong>');
  // Italic
  result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
  result = result.replace(/_(.+?)_/g, '<em>$1</em>');
  // Strikethrough
  result = result.replace(/~~(.+?)~~/g, '<del>$1</del>');
  // Inline code
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
  return result;
}

export function getThemes() {
  return themes;
}

export async function exportStyledHtml(themeId = 'minimal') {
  const theme = themes[themeId] || themes.minimal;
  const markdown = documentStore.getMarkdown();
  const htmlContent = markdownToHtml(markdown);
  const fileName = documentStore.getFileName().replace(/\.(md|markdown)$/i, '') || 'document';

  // Extract title from H1
  const titleMatch = markdown.match(/^#\s+(.+)/m);
  const title = titleMatch ? titleMatch[1] : fileName;

  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>${theme.css}</style>
</head>
<body>
${htmlContent}
</body>
</html>`;

  const blob = new Blob([fullHtml], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName}.html`;
  a.click();
  URL.revokeObjectURL(url);

  toast(`Exported as ${theme.name} HTML`, 'success');
}
