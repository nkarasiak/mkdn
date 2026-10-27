// Pure helpers for the right-click menu (checked by scripts/check-context-menu-utils.mjs).

/** GitHub-style heading anchor: "Day 2 — Lyon" → "day-2--lyon". */
export function slugify(text) {
  return text.trim().toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '').replace(/ /g, '-');
}

/** Natural order: "9" < "10", "275 €" < "310 €", case-insensitive. */
export function compareCells(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/** Rows sorted by column `col` (dir 1 = ascending, -1 = descending); empty cells always last. */
export function sortRows(rows, col, dir) {
  const empty = r => !(r[col] ?? '').trim();
  return [...rows].sort((a, b) => (empty(a) - empty(b)) || (empty(a) ? 0 : dir * compareCells(a[col], b[col])));
}

/** Tab-separated values: pastes into a spreadsheet as cells. */
export function toTsv(rows) {
  return rows.map(r => r.map(c => c.replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n');
}
