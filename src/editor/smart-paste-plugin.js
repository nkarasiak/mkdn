import { Plugin, PluginKey } from '@milkdown/prose/state';

const smartPasteKey = new PluginKey('smart-paste');

const URL_RE = /^https?:\/\/[^\s<>'"`]+$/i;

const LANG_PATTERNS = [
  { lang: 'bash', re: /^#!\s*\/.*\/(?:bash|sh|zsh|env\s+(?:bash|sh|zsh))/m },
  { lang: 'python', re: /^#!\s*\/.*\/(?:python|env\s+python)|^\s*(?:def\s+\w+\s*\(|import\s+\w+|from\s+\w+\s+import)/m },
  { lang: 'javascript', re: /(?:^|\s)(?:const|let|var)\s+\w+\s*=|\bfunction\s+\w+\s*\(|=>\s*[{(]|^\s*console\.log\(/m },
  { lang: 'typescript', re: /^\s*(?:interface|type)\s+\w+|:\s*(?:string|number|boolean|any|void)\b/m },
  { lang: 'rust', re: /^\s*(?:fn\s+\w+\s*\(|let\s+mut\s+\w+|use\s+\w+::|impl\s+\w+)/m },
  { lang: 'go', re: /^\s*(?:package\s+\w+|func\s+\w+\s*\(|import\s+["(])/m },
  { lang: 'java', re: /^\s*(?:public|private|protected)\s+(?:static\s+)?(?:class|interface|\w+)\s+\w+/m },
  { lang: 'sql', re: /^\s*(?:SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\s+/im },
  { lang: 'html', re: /^\s*<(?:!DOCTYPE\s+html|html|head|body|div|span|p|a|h[1-6])/im },
  { lang: 'css', re: /^[.#]?[\w-]+\s*\{[^}]*(?:[\w-]+\s*:\s*[^;]+;[\s\S]*)\}/m },
  { lang: 'json', re: /^\s*[{[][\s\S]*[}\]]\s*$/ },
  { lang: 'yaml', re: /^[\w-]+:\s*(?:[\w-]+|\d+|true|false|null|\[|\{)/m },
];

function detectLanguage(text) {
  for (const { lang, re } of LANG_PATTERNS) {
    if (re.test(text)) return lang;
  }
  return '';
}

function looksLikeCode(text) {
  if (!text.includes('\n')) return false;
  const lines = text.split('\n');
  if (lines.length < 2) return false;

  // Skip code detection if it already contains markdown headings or list bullets
  if (/^\s*(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+)/m.test(text)) return false;

  // Heuristic: heavy use of code-ish tokens
  const codeTokens = text.match(/[{};=()<>\[\]]|=>|::|->/g)?.length || 0;
  const charCount = text.length;
  const ratio = codeTokens / Math.max(charCount, 1);

  // Also accept if a language pattern matches strongly
  if (detectLanguage(text)) return true;
  return ratio > 0.04;
}

export function createSmartPastePlugin() {
  return new Plugin({
    key: smartPasteKey,
    props: {
      handlePaste(view, event, slice) {
        const cd = event.clipboardData;
        if (!cd) return false;

        const text = cd.getData('text/plain') || '';
        const html = cd.getData('text/html') || '';
        if (!text) return false;

        const trimmed = text.trim();
        const { state, dispatch } = view;
        const { schema, selection } = state;
        const hasSelection = selection.from !== selection.to;

        // 1. URL + selected text → wrap selection with link
        if (hasSelection && URL_RE.test(trimmed)) {
          const linkMarkType = schema.marks.link;
          if (linkMarkType) {
            event.preventDefault();
            const tr = state.tr.addMark(selection.from, selection.to, linkMarkType.create({ href: trimmed }));
            dispatch(tr.scrollIntoView());
            return true;
          }
        }

        // 2. Bare URL alone, no selection → insert as link paragraph
        //    (embed plugin runs first and grabs YouTube/Twitter URLs; this catches the rest)
        if (!hasSelection && !html && URL_RE.test(trimmed)) {
          const linkMarkType = schema.marks.link;
          if (linkMarkType && schema.nodes.paragraph) {
            event.preventDefault();
            const linkMark = linkMarkType.create({ href: trimmed });
            const linkNode = schema.text(trimmed, [linkMark]);
            const paragraph = schema.nodes.paragraph.create(null, linkNode);
            dispatch(state.tr.replaceSelectionWith(paragraph).scrollIntoView());
            return true;
          }
        }

        // 3. Multi-line code → fenced code block
        if (!html && looksLikeCode(text)) {
          const codeBlockType = schema.nodes.code_block;
          if (codeBlockType) {
            event.preventDefault();
            const lang = detectLanguage(text);
            const codeNode = codeBlockType.create(
              lang ? { language: lang } : null,
              schema.text(text.replace(/\n+$/, '')),
            );
            dispatch(state.tr.replaceSelectionWith(codeNode).scrollIntoView());
            return true;
          }
        }

        return false;
      },
    },
  });
}
