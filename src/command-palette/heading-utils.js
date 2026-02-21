/**
 * Extract headings from markdown text.
 * Returns [{ level, text, line }]
 */
export function extractHeadings(markdown) {
  if (!markdown) return [];
  const headings = [];
  const lines = markdown.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)/);
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        line: i,
      });
    }
  }
  return headings;
}

/**
 * Scroll the Milkdown editor to a heading by text and level.
 */
export function scrollToHeading(milkdown, text, level) {
  const pos = milkdown.findHeadingPos(text, level);
  if (pos != null) {
    milkdown.scrollToPos(pos);
  }
}
