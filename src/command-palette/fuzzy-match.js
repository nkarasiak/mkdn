/**
 * Lightweight subsequence fuzzy match.
 * Returns { score, matches } or null if no match.
 */
export function fuzzyMatch(query, target) {
  if (!query) return { score: 0, matches: [] };

  const q = query.toLowerCase();
  const t = target.toLowerCase();

  let qi = 0;
  let ti = 0;
  const matches = [];
  let score = 0;
  let prevMatch = -1;

  while (qi < q.length && ti < t.length) {
    if (q[qi] === t[ti]) {
      matches.push(ti);

      // Start of string bonus
      if (ti === 0) score += 10;

      // Word boundary bonus (char after space, hyphen, slash, or uppercase)
      if (ti > 0 && /[\s\-_/]/.test(t[ti - 1])) score += 8;

      // Consecutive match bonus
      if (prevMatch === ti - 1) score += 5;

      prevMatch = ti;
      qi++;
    }
    ti++;
  }

  // All query chars must be found
  if (qi < q.length) return null;

  // Shorter targets get a small bonus (prefer tighter matches)
  score += Math.max(0, 20 - target.length);

  return { score, matches };
}

/**
 * Highlight matched characters in a string.
 * Returns an array of { text, highlight } segments.
 */
export function highlightMatches(text, matches) {
  if (!matches || matches.length === 0) return [{ text, highlight: false }];

  const segments = [];
  let last = 0;
  const matchSet = new Set(matches);

  for (let i = 0; i < text.length; i++) {
    if (matchSet.has(i)) {
      if (last < i) segments.push({ text: text.slice(last, i), highlight: false });
      // Collect consecutive highlights
      let end = i;
      while (end < text.length && matchSet.has(end)) end++;
      segments.push({ text: text.slice(i, end), highlight: true });
      last = end;
      i = end - 1;
    }
  }
  if (last < text.length) segments.push({ text: text.slice(last), highlight: false });

  return segments;
}
