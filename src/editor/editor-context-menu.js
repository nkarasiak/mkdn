// Right-click menu content: what was clicked (detectContext) → which items (one builder per kind).
// Loaded on the first right-click (see installContextMenu in milkdown-setup.js).
import { NodeSelection, AllSelection } from '@milkdown/prose/state';
import { DOMSerializer } from '@milkdown/prose/model';
import {
  toggleStrongCommand, toggleEmphasisCommand, toggleInlineCodeCommand, turnIntoTextCommand,
  wrapInHeadingCommand, wrapInBlockquoteCommand, wrapInBulletListCommand, wrapInOrderedListCommand,
  createCodeBlockCommand, insertHrCommand,
} from '@milkdown/preset-commonmark';
import { toggleStrikethroughCommand, insertTableCommand } from '@milkdown/preset-gfm';
import { milkdown } from './milkdown-setup.js';
import { cut, copy, paste, pastePlain, writeClipboard } from './clipboard.js';
import { openContextMenu } from '../ui/context-menu.js';
import { documentStore } from '../store/document-store.js';
import { settingsStore } from '../store/settings-store.js';
import { isTauri } from '../platform/tauri-bridge.js';
import { icons } from '../toolbar/toolbar-icons.js';

const run = (cmd, payload) => () => milkdown.runCommand(cmd.key, payload);
const linkPopover = (anchor, values) => () => import('../ui/link-popover.js').then(m => m.openLinkPopover(anchor, values));
const findBar = (withReplace, query) => () => import('../find-replace/find-bar.js').then(m => m.openFindBar(withReplace, query));

/** Open a URL in the system browser (desktop) or a new browser tab. */
export function openExternal(url) {
  if (isTauri()) import('@tauri-apps/plugin-shell').then(m => m.open(url));
  else window.open(url, '_blank', 'noopener');
}

/** Range of the `type` mark around $pos within its parent block, or null. */
function markRange($pos, type) {
  const parent = $pos.parent;
  const start = $pos.start();
  let offset = 0, from = null, to = null;
  for (let i = 0; i < parent.childCount; i++) {
    const child = parent.child(i);
    const end = offset + child.nodeSize;
    if (type.isInSet(child.marks)) {
      if (from === null) from = offset;
      to = end;
    } else if (to !== null && to >= $pos.parentOffset) {
      break;
    } else {
      from = to = null;
    }
    offset = end;
  }
  return from !== null && from <= $pos.parentOffset && to >= $pos.parentOffset && to > from
    ? { from: start + from, to: start + to } : null;
}

/** What the right-click landed on. First match wins: selection, link, image, table, heading. */
export function detectContext(view) {
  const { state } = view;
  const sel = state.selection;
  if (sel instanceof NodeSelection && sel.node.type.name.startsWith('image')) {
    return { kind: 'image', pos: sel.from, node: sel.node };
  }
  if (!sel.empty) return { kind: 'selection' };
  const { $from } = sel;
  const link = state.schema.marks.link;
  const range = link && markRange($from, link);
  if (range) {
    const mark = state.doc.resolve(range.from + 1).marks().find(m => m.type === link)
      ?? $from.marks().find(m => m.type === link);
    return { kind: 'link', href: mark?.attrs.href ?? '', ...range };
  }
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === 'table') {
      const row = $from.index(d);
      const col = $from.index(d + 1);
      return { kind: 'table', tablePos: $from.before(d), table: node, row, col, align: $from.node(d + 2)?.attrs.alignment ?? 'left' };
    }
  }
  if ($from.parent.type.name === 'heading') {
    return { kind: 'heading', level: $from.parent.attrs.level, pos: $from.before(), node: $from.parent };
  }
  return { kind: 'default' };
}

const clipboardItems = (view) => [
  { label: 'Cut', hint: 'Ctrl+X', action: () => cut(view) },
  { label: 'Copy', hint: 'Ctrl+C', action: () => copy(view) },
  { label: 'Paste', hint: 'Ctrl+V', action: () => paste(view) },
];

// Bullet list, then tick the list item as a task.
function toTaskList(view) {
  milkdown.runCommand(wrapInBulletListCommand.key);
  const { state } = view;
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'list_item') {
      view.dispatch(state.tr.setNodeMarkup($from.before(d), null, { ...$from.node(d).attrs, checked: false }));
      return;
    }
  }
}

const turnIntoItems = (view) => [
  { label: 'Paragraph', action: run(turnIntoTextCommand) },
  { label: 'Heading 1', action: run(wrapInHeadingCommand, 1) },
  { label: 'Heading 2', action: run(wrapInHeadingCommand, 2) },
  { label: 'Heading 3', action: run(wrapInHeadingCommand, 3) },
  { label: 'Quote', action: run(wrapInBlockquoteCommand) },
  { label: 'Bulleted list', action: run(wrapInBulletListCommand) },
  { label: 'Numbered list', action: run(wrapInOrderedListCommand) },
  { label: 'Task list', action: () => toTaskList(view) },
  { label: 'Code block', action: run(createCodeBlockCommand) },
];

function selectionItems(view) {
  const { state } = view;
  const { from, to } = state.selection;
  const has = name => state.schema.marks[name] && state.doc.rangeHasMark(from, to, state.schema.marks[name]);
  const text = milkdown.getSelectedText().replace(/\s+/g, ' ').trim();
  const short = text.length > 20 ? `${text.slice(0, 20)}…` : text;
  return [
    { strip: [
      { icon: icons.bold, title: 'Bold (Ctrl+B)', active: has('strong'), action: run(toggleStrongCommand) },
      { icon: icons.italic, title: 'Italic (Ctrl+I)', active: has('emphasis'), action: run(toggleEmphasisCommand) },
      { icon: icons.strike, title: 'Strikethrough', active: has('strike_through'), action: run(toggleStrikethroughCommand) },
      { icon: icons.code, title: 'Inline code', active: has('inlineCode'), action: run(toggleInlineCodeCommand) },
      { icon: icons.link, title: 'Link (Ctrl+L)', active: has('link'), action: linkPopover() },
    ] },
    ...clipboardItems(view),
    'sep',
    { label: 'Copy as Markdown', action: () => writeClipboard({ text: milkdown.selectionToMarkdown() }) },
    'sep',
    { label: 'Turn into', submenu: turnIntoItems(view) },
    text && { label: `Find “${short}”`, hint: 'Ctrl+F', action: findBar(false, text) },
    text && { label: 'Search the web', action: () => openExternal(`https://www.google.com/search?q=${encodeURIComponent(text)}`) },
  ];
}

function documentHtml(view) {
  const div = document.createElement('div');
  div.append(DOMSerializer.fromSchema(view.state.schema).serializeFragment(view.state.doc.content));
  return div.innerHTML;
}

function insertDate(view) {
  const date = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  view.dispatch(view.state.tr.insertText(date).scrollIntoView());
}

function defaultItems(view) {
  return [
    { label: 'Paste', hint: 'Ctrl+V', action: () => paste(view) },
    { label: 'Paste as plain text', hint: 'Ctrl+Shift+V', action: () => pastePlain(view) },
    'sep',
    { label: 'Insert', submenu: [
      { label: 'Table', hint: '3 × 3', action: run(insertTableCommand, { row: 3, col: 3 }) },
      { label: 'Task list', action: () => toTaskList(view) },
      { label: 'Code block', action: run(createCodeBlockCommand) },
      { label: 'Quote', action: run(wrapInBlockquoteCommand) },
      { label: 'Divider', action: run(insertHrCommand) },
      { label: 'Today’s date', action: () => insertDate(view) },
      'sep',
      { label: 'Link…', hint: 'Ctrl+L', action: linkPopover() },
    ] },
    'sep',
    { label: 'Select all', hint: 'Ctrl+A', action: () => view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc))) },
    { label: 'Copy document as rich text', action: () => writeClipboard({ html: documentHtml(view), text: documentStore.getMarkdown() }) },
    { label: 'Find and replace', hint: 'Ctrl+H', action: findBar(true) },
    { label: 'Source view', hint: 'Ctrl+U', action: () => settingsStore.set('sourceMode', true) },
    { label: 'Version history…', hint: 'Ctrl+Shift+H', action: () => import('../history/history-panel.js').then(m => m.openHistory()) },
  ];
}

const builders = { selection: selectionItems, default: defaultItems };

export function openEditorMenu(view, x, y) {
  const ctx = detectContext(view);
  const items = (builders[ctx.kind] ?? defaultItems)(view, ctx);
  openContextMenu(x, y, items);
}
