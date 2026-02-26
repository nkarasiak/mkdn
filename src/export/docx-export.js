import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, ExternalHyperlink } from 'docx';
import { documentStore } from '../store/document-store.js';
import { toast } from '../ui/toast.js';

function parseMarkdownToDocx(markdown) {
  const lines = markdown.split('\n');
  const children = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.startsWith('```')) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      children.push(new Paragraph({
        children: [new TextRun({ text: codeLines.join('\n'), font: 'Courier New', size: 20 })],
        spacing: { before: 120, after: 120 },
        shading: { fill: 'F5F5F5' },
      }));
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingMap = {
        1: HeadingLevel.HEADING_1,
        2: HeadingLevel.HEADING_2,
        3: HeadingLevel.HEADING_3,
        4: HeadingLevel.HEADING_4,
        5: HeadingLevel.HEADING_5,
        6: HeadingLevel.HEADING_6,
      };
      children.push(new Paragraph({
        children: parseInline(headingMatch[2]),
        heading: headingMap[level],
      }));
      i++;
      continue;
    }

    // HR
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      children.push(new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' } },
        spacing: { before: 200, after: 200 },
      }));
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
      children.push(new Paragraph({
        children: parseInline(quoteLines.join(' ')),
        indent: { left: 720 },
        border: { left: { style: BorderStyle.SINGLE, size: 6, color: '999999' } },
        spacing: { before: 120, after: 120 },
      }));
      continue;
    }

    // Unordered list
    if (/^[-*+]\s/.test(line)) {
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        children.push(new Paragraph({
          children: parseInline(lines[i].replace(/^[-*+]\s/, '')),
          bullet: { level: 0 },
        }));
        i++;
      }
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      let num = 0;
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        num++;
        children.push(new Paragraph({
          children: parseInline(lines[i].replace(/^\d+\.\s/, '')),
          numbering: { reference: 'default-numbering', level: 0 },
        }));
        i++;
      }
      continue;
    }

    // Table
    if (line.includes('|') && i + 1 < lines.length && /^\|?\s*[-:]+/.test(lines[i + 1])) {
      const headerCells = line.split('|').filter(c => c.trim());
      i += 2;
      const rows = [headerCells];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(lines[i].split('|').filter(c => c.trim()));
        i++;
      }

      const tableRows = rows.map((row, idx) =>
        new TableRow({
          children: row.map(cell =>
            new TableCell({
              children: [new Paragraph({
                children: parseInline(cell.trim()),
                ...(idx === 0 ? { bold: true } : {}),
              })],
              width: { size: Math.floor(100 / row.length), type: WidthType.PERCENTAGE },
            })
          ),
        })
      );

      children.push(new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } }));
      continue;
    }

    // Paragraph
    const paraLines = [];
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('#') && !lines[i].startsWith('```') && !/^[-*+]\s/.test(lines[i]) && !/^\d+\.\s/.test(lines[i]) && !lines[i].startsWith('> ') && !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim())) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length) {
      children.push(new Paragraph({
        children: parseInline(paraLines.join(' ')),
        spacing: { after: 120 },
      }));
    }
  }

  return children;
}

function parseInline(text) {
  const runs = [];
  // Simple regex-based inline parser
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|__(.+?)__|_(.+?)_|\*(.+?)\*|~~(.+?)~~|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|[^*_~`[\]]+)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const full = match[0];

    if (match[2]) {
      // Bold + Italic
      runs.push(new TextRun({ text: match[2], bold: true, italics: true }));
    } else if (match[3] || match[4]) {
      // Bold
      runs.push(new TextRun({ text: match[3] || match[4], bold: true }));
    } else if (match[5] || match[6]) {
      // Italic
      runs.push(new TextRun({ text: match[5] || match[6], italics: true }));
    } else if (match[7]) {
      // Strikethrough
      runs.push(new TextRun({ text: match[7], strike: true }));
    } else if (match[8]) {
      // Inline code
      runs.push(new TextRun({ text: match[8], font: 'Courier New', size: 20 }));
    } else if (match[9] && match[10]) {
      // Link
      runs.push(new ExternalHyperlink({
        children: [new TextRun({ text: match[9], style: 'Hyperlink' })],
        link: match[10],
      }));
    } else {
      // Plain text
      runs.push(new TextRun({ text: full }));
    }
  }

  return runs.length ? runs : [new TextRun({ text })];
}

export async function exportDocx() {
  const markdown = documentStore.getMarkdown();
  const fileName = documentStore.getFileName().replace(/\.(md|markdown)$/i, '') || 'document';

  try {
    const doc = new Document({
      numbering: {
        config: [{
          reference: 'default-numbering',
          levels: [{
            level: 0,
            format: 'decimal',
            text: '%1.',
            alignment: AlignmentType.START,
          }],
        }],
      },
      sections: [{
        properties: {},
        children: parseMarkdownToDocx(markdown),
      }],
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.docx`;
    a.click();
    URL.revokeObjectURL(url);

    toast('Exported as DOCX', 'success');
  } catch (e) {
    toast(`DOCX export failed: ${e.message}`, 'error');
  }
}
