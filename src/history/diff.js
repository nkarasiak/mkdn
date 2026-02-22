/**
 * Lightweight line-based diff (Myers-like) — no external dependencies.
 * Returns an array of { type: 'same'|'add'|'remove', line } entries.
 */
export function computeDiff(oldText, newText) {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const lcs = longestCommonSubsequence(oldLines, newLines);

  const result = [];
  let oi = 0;
  let ni = 0;
  let li = 0;

  while (oi < oldLines.length || ni < newLines.length) {
    if (li < lcs.length && oi < oldLines.length && ni < newLines.length &&
        oldLines[oi] === lcs[li] && newLines[ni] === lcs[li]) {
      result.push({ type: 'same', line: lcs[li] });
      oi++; ni++; li++;
    } else if (oi < oldLines.length && (li >= lcs.length || oldLines[oi] !== lcs[li])) {
      result.push({ type: 'remove', line: oldLines[oi] });
      oi++;
    } else if (ni < newLines.length && (li >= lcs.length || newLines[ni] !== lcs[li])) {
      result.push({ type: 'add', line: newLines[ni] });
      ni++;
    }
  }

  return result;
}

function longestCommonSubsequence(a, b) {
  const m = a.length;
  const n = b.length;
  // Build DP table
  const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find the LCS
  const result = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.push(a[i - 1]);
      i--; j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return result.reverse();
}

/**
 * Collapse long unchanged sections into context summaries.
 * Shows `contextLines` unchanged lines around each change, collapses the rest.
 */
export function collapseDiff(entries, contextLines = 3) {
  const result = [];
  const len = entries.length;

  // Mark which lines are near a change
  const show = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    if (entries[i].type !== 'same') {
      for (let j = Math.max(0, i - contextLines); j <= Math.min(len - 1, i + contextLines); j++) {
        show[j] = 1;
      }
    }
  }

  for (let i = 0; i < len; i++) {
    if (show[i]) {
      result.push(entries[i]);
    } else {
      // Count hidden same lines
      let count = 0;
      while (i < len && !show[i]) { count++; i++; }
      i--;
      result.push({ type: 'collapse', count });
    }
  }

  return result;
}
