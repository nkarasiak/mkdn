import { TextSelection } from '@milkdown/prose/state';
import { findReplaceState } from './find-replace-plugin.js';

/**
 * Build a flat text string from ProseMirror doc and a position mapping.
 * Block boundaries become '\n'.
 */
function buildTextMap(doc) {
  let text = '';
  const map = []; // Array of { docPos, textOffset }

  doc.descendants((node, pos) => {
    if (node.isText) {
      map.push({ docPos: pos, textOffset: text.length });
      text += node.text;
    } else if (node.isBlock && text.length > 0 && text[text.length - 1] !== '\n') {
      text += '\n';
    }
  });

  return { text, map };
}

/**
 * Map a text offset back to a ProseMirror document position using the position map.
 */
function textOffsetToDocPos(map, offset) {
  // Find the map entry that contains this offset
  for (let i = map.length - 1; i >= 0; i--) {
    if (map[i].textOffset <= offset) {
      return map[i].docPos + (offset - map[i].textOffset);
    }
  }
  return 0;
}

// ============================================================
// ProseMirror Engine
// ============================================================

export function createProseMirrorEngine(getView) {
  let ranges = [];
  let currentIndex = -1;

  function findAll(query, caseSensitive) {
    ranges = [];
    currentIndex = -1;

    const view = getView();
    if (!view || !query) {
      updateDecorations(view);
      return;
    }

    const { text, map } = buildTextMap(view.state.doc);
    const flags = caseSensitive ? 'g' : 'gi';
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, flags);

    let match;
    while ((match = re.exec(text)) !== null) {
      const from = textOffsetToDocPos(map, match.index);
      const to = textOffsetToDocPos(map, match.index + match[0].length);
      ranges.push({ from, to });
      if (match[0].length === 0) break; // prevent infinite loop on empty match
    }

    if (ranges.length > 0) currentIndex = 0;
    updateDecorations(view);
  }

  function updateDecorations(view) {
    if (!view) return;
    findReplaceState.ranges = ranges;
    findReplaceState.currentIndex = currentIndex;
    const tr = view.state.tr.setMeta('find-replace-update', true);
    view.dispatch(tr);
  }

  function scrollToCurrent() {
    const view = getView();
    if (!view || currentIndex < 0 || currentIndex >= ranges.length) return;
    const { from, to } = ranges[currentIndex];
    const tr = view.state.tr
      .setSelection(TextSelection.create(view.state.doc, from, to))
      .scrollIntoView()
      .setMeta('find-replace-update', true);
    findReplaceState.currentIndex = currentIndex;
    view.dispatch(tr);
  }

  return {
    findAll,
    goToNext() {
      if (ranges.length === 0) return;
      currentIndex = (currentIndex + 1) % ranges.length;
      scrollToCurrent();
    },
    goToPrev() {
      if (ranges.length === 0) return;
      currentIndex = (currentIndex - 1 + ranges.length) % ranges.length;
      scrollToCurrent();
    },
    replace(replacement) {
      const view = getView();
      if (!view || currentIndex < 0 || currentIndex >= ranges.length) return;
      const { from, to } = ranges[currentIndex];
      const tr = view.state.tr.insertText(replacement, from, to);
      view.dispatch(tr);
      // Re-adjust ranges after replacement
      const delta = replacement.length - (to - from);
      ranges.splice(currentIndex, 1);
      // Shift subsequent ranges
      for (let i = currentIndex; i < ranges.length; i++) {
        ranges[i] = { from: ranges[i].from + delta, to: ranges[i].to + delta };
      }
      if (ranges.length === 0) {
        currentIndex = -1;
      } else {
        currentIndex = currentIndex % ranges.length;
      }
      updateDecorations(view);
      if (currentIndex >= 0) scrollToCurrent();
    },
    replaceAll(replacement) {
      const view = getView();
      if (!view || ranges.length === 0) return;
      // Replace in reverse order to preserve positions
      let tr = view.state.tr;
      for (let i = ranges.length - 1; i >= 0; i--) {
        tr = tr.insertText(replacement, ranges[i].from, ranges[i].to);
      }
      view.dispatch(tr);
      ranges = [];
      currentIndex = -1;
      updateDecorations(view);
    },
    clearHighlights() {
      ranges = [];
      currentIndex = -1;
      const view = getView();
      updateDecorations(view);
    },
    getCurrentIndex() { return currentIndex; },
    getTotal() { return ranges.length; },
  };
}

// ============================================================
// Textarea Engine
// ============================================================

export function createTextareaEngine(getTextarea) {
  let ranges = [];
  let currentIndex = -1;
  let highlightRegistered = false;

  function findAll(query, caseSensitive) {
    ranges = [];
    currentIndex = -1;

    const ta = getTextarea();
    if (!ta || !query) {
      clearCSSHighlights();
      return;
    }

    const text = ta.value;
    const flags = caseSensitive ? 'g' : 'gi';
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, flags);

    let match;
    while ((match = re.exec(text)) !== null) {
      ranges.push({ from: match.index, to: match.index + match[0].length });
      if (match[0].length === 0) break;
    }

    if (ranges.length > 0) currentIndex = 0;
    updateHighlights(ta);
  }

  function updateHighlights(ta) {
    // Use CSS Custom Highlight API if available
    if (CSS.highlights && ta) {
      try {
        // Get the text node inside textarea — not directly possible
        // CSS Highlights don't work on textarea content, so we just use selection
        clearCSSHighlights();
      } catch { /* ignore */ }
    }
    if (currentIndex >= 0 && ta) {
      const { from, to } = ranges[currentIndex];
      ta.setSelectionRange(from, to);
      ta.focus();
    }
  }

  function clearCSSHighlights() {
    if (CSS.highlights) {
      CSS.highlights.delete('find-matches');
      CSS.highlights.delete('find-current');
    }
  }

  return {
    findAll,
    goToNext() {
      if (ranges.length === 0) return;
      currentIndex = (currentIndex + 1) % ranges.length;
      const ta = getTextarea();
      if (ta) {
        const { from, to } = ranges[currentIndex];
        ta.setSelectionRange(from, to);
        ta.focus();
      }
    },
    goToPrev() {
      if (ranges.length === 0) return;
      currentIndex = (currentIndex - 1 + ranges.length) % ranges.length;
      const ta = getTextarea();
      if (ta) {
        const { from, to } = ranges[currentIndex];
        ta.setSelectionRange(from, to);
        ta.focus();
      }
    },
    replace(replacement) {
      const ta = getTextarea();
      if (!ta || currentIndex < 0 || currentIndex >= ranges.length) return;
      const { from, to } = ranges[currentIndex];
      ta.setRangeText(replacement, from, to, 'end');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      // Re-adjust
      const delta = replacement.length - (to - from);
      ranges.splice(currentIndex, 1);
      for (let i = currentIndex; i < ranges.length; i++) {
        ranges[i] = { from: ranges[i].from + delta, to: ranges[i].to + delta };
      }
      if (ranges.length === 0) {
        currentIndex = -1;
      } else {
        currentIndex = currentIndex % ranges.length;
        const r = ranges[currentIndex];
        ta.setSelectionRange(r.from, r.to);
      }
    },
    replaceAll(replacement) {
      const ta = getTextarea();
      if (!ta || ranges.length === 0) return;
      // Replace in reverse to preserve positions
      for (let i = ranges.length - 1; i >= 0; i--) {
        ta.setRangeText(replacement, ranges[i].from, ranges[i].to, 'end');
      }
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ranges = [];
      currentIndex = -1;
    },
    clearHighlights() {
      ranges = [];
      currentIndex = -1;
      clearCSSHighlights();
    },
    getCurrentIndex() { return currentIndex; },
    getTotal() { return ranges.length; },
  };
}
