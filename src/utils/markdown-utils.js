/**
 * Get word and line count from markdown text.
 */
export function getStats(text) {
  const lines = text.split('\n').length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const chars = text.length;
  return { lines, words, chars };
}
