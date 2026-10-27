# Right-click Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the browser's right-click menu in the WYSIWYG editor with an mkdn menu that adapts to what was clicked (selection, link, heading, table, image, anything else).

**Architecture:** A generic popover menu (`src/ui/context-menu.js`, styled like the ☰ menu) is filled by `src/editor/editor-context-menu.js`, which detects the context from the ProseMirror state and builds the items. `milkdown-setup.js` only installs a tiny synchronous `contextmenu` listener and dynamic-imports the rest on first use. Clipboard access lives in `src/editor/clipboard.js` (browser Clipboard API, Tauri clipboard plugin on desktop).

**Tech Stack:** Vanilla JS, Milkdown 7 / ProseMirror, Vite, Tauri 2.

**Spec:** `docs/superpowers/specs/2026-10-27-context-menu-design.md`

## Global Constraints

- Nothing new in the startup bundle: `editor-context-menu.js`, `context-menu.js`, `clipboard.js` and `table-ops.js` are reached only through dynamic `import()`.
- UI built with `el()` (`src/utils/dom.js`); menu styles live in `src/styles/toolbar.css` next to `.app-menu` and reuse `.app-menu`, `.app-menu-item`, `.app-menu-sep`.
- Shortcut hints are written `Ctrl+…` (like the ☰ menu).
- Every document change goes through a ProseMirror transaction / Milkdown command (normal editor → store sync), one undo step per action.
- Source mode, Shift+right-click, touch long-press, and right-clicks inside CodeMirror (`.cm-editor`) or an `input`/`textarea`: native menu (don't `preventDefault`).
- Commits follow Conventional Commits (AGENTS.md scopes), ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No test runner exists: pure logic gets a `node` assert script; UI is verified in the dev server (`npm run dev`, http://localhost:3000/mkdn/) with the Chrome DevTools MCP `evaluate_script`, then `npm run build` must pass.

**Driving the menu from DevTools** (used by every UI verification step):

```js
// open the menu on the first element matching `sel` (inside the editor)
async (sel) => {
  const t = document.querySelector('.milkdown .ProseMirror ' + sel);
  const r = t.getBoundingClientRect();
  t.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 4, clientY: r.top + 4 }));
  await new Promise(res => setTimeout(res, 300)); // dynamic import
  const m = document.querySelector('.ctx-menu:popover-open');
  return m && [...m.querySelectorAll('.app-menu-item, .ctx-section, .ctx-info, .ctx-strip button')].map(e => e.title || e.textContent.trim());
}
```

Load a test document first with `documentStore.setFile('t.md', 't.md', MD, 'local')` via `await import('/mkdn/src/store/document-store.js')`.

## Review Focus

- Right-click **inside an existing selection** must keep the selection (Selection menu), not collapse it. → Task 4 Step 4.
- Menu opened near the **bottom-right edge** must stay fully inside the window (flip up/left). → Task 3 Step 3.
- Right-click **in a code block** must show the native menu (event not `defaultPrevented`). → Task 4 Step 4.
- **Undo** after Sort / Delete row / Remove link must restore the previous state in one Ctrl+Z. → Task 6 Step 3, Task 5 Step 3.
- **Dark theme**: menu background/text come from theme variables, readable in dark. → Task 3 Step 3.

---

### Task 1: Keep image descriptions (alt text) through load and save

**Files:**
- Modify: `src/editor/milkdown-setup.js` (after the `.addFeature(imageBlock)` chain, before `crepe.create()`)

**Interfaces:**
- Produces: image-block nodes get an `alt` attr (string, default `''`).

- [ ] **Step 1: Reproduce in the dev server.** Load `MD = 'Before\n\n![Sunset at Fourvière](https://example.com/a.png "Lyon")\n\nAfter\n'`, then `documentStore.getMarkdown()`. Expected now (bug): contains `![1.00](https://example.com/a.png "Lyon")`.
- [ ] **Step 2: Override the schema** with `crepe.editor.use(imageBlockSchema.extendSchema(prev => ctx => …))` (`imageBlockSchema` from `@milkdown/components/image-block`): add `alt: { default: '', validate: 'string' }` to `attrs`; `parseMarkdown.runner` adds `{ src: node.url, caption: node.title ?? '', alt: node.alt ?? '', ratio: 1 }`; `toMarkdown.runner` writes `alt: node.attrs.alt`. Keep `match`, `parseDOM`/`toDOM` from `prev(ctx)` (add `alt` to `parseDOM` attrs). If the extended schema doesn't replace the original (duplicate `image-block` id), check the Milkdown docs for `extendSchema` registration order and fix accordingly.
- [ ] **Step 3: Verify.** Same load → `getMarkdown()` contains `![Sunset at Fourvière](https://example.com/a.png "Lyon")`; the image still renders as a block with caption "Lyon"; a document with `![1.00](x.png)` round-trips unchanged. `npm run build` passes.
- [ ] **Step 4: CHANGELOG + commit.** Under `## [Unreleased]` → `### Fixed`: `- **Image descriptions were lost** — an image on its own line was saved with its description replaced by "1.00".`
```bash
git add src/editor/milkdown-setup.js CHANGELOG.md
git commit -m "fix(editor): keep image descriptions when saving"
```

### Task 2: Pure helpers (slug, cell sort, TSV)

**Files:**
- Create: `src/editor/context-menu-utils.js`
- Create: `scripts/check-context-menu-utils.mjs`

**Interfaces:**
- Produces:
  - `slugify(text: string): string` — GitHub heading anchor: lowercase, drop every char that isn't a letter, number, space, `-` or `_` (Unicode-aware), then each space → `-`.
  - `compareCells(a: string, b: string): number` — `a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })`.
  - `sortRows(rows: string[][], col: number, dir: 1 | -1): string[][]` — new array; rows whose `col` cell is empty (after trim) always go last, whatever `dir`; stable.
  - `toTsv(rows: string[][]): string` — cells joined by `\t`, rows by `\n`; tabs and newlines inside a cell become a space.

- [ ] **Step 1: Write the check script**
```js
import assert from 'node:assert/strict';
import { slugify, compareCells, sortRows, toTsv } from '../src/editor/context-menu-utils.js';
assert.equal(slugify('Day 2 — Lyon'), 'day-2--lyon');
assert.equal(slugify('Hello, World!'), 'hello-world');
assert.equal(slugify('Café au lait'), 'café-au-lait');
assert.ok(compareCells('9', '10') < 0);
assert.ok(compareCells('275 €', '310 €') < 0);
assert.deepEqual(sortRows([['b'], [''], ['a']], 0, 1), [['a'], ['b'], ['']]);
assert.deepEqual(sortRows([['b'], [''], ['a']], 0, -1), [['b'], ['a'], ['']]);
assert.equal(toTsv([['a', 'b\tc'], ['1', 'x\ny']]), 'a\tb c\n1\tx y');
console.log('context-menu-utils OK');
```
- [ ] **Step 2: Run it** — `node scripts/check-context-menu-utils.mjs` → fails (module not found).
- [ ] **Step 3: Implement** the four functions.
- [ ] **Step 4: Run it** → prints `context-menu-utils OK`.
- [ ] **Step 5: Commit** — `git add src/editor/context-menu-utils.js scripts/check-context-menu-utils.mjs && git commit -m "feat(editor): add context menu helpers"`

### Task 3: Generic popover menu

**Files:**
- Create: `src/ui/context-menu.js`
- Modify: `src/styles/toolbar.css` (after the `.app-menu-*` rules)

**Interfaces:**
- Produces:
  - `openContextMenu(x: number, y: number, items: MenuItem[]): void` — replaces any open menu.
  - `closeContextMenu(): void`
  - `MenuItem` (falsy entries are skipped, so callers can write `cond && {…}`):
    - `{ label, hint?, mono?: boolean, action }` → `<button class="app-menu-item">` with `<kbd>`-styled hint (monospace when `mono`)
    - `{ label, submenu: MenuItem[] }` → row with `▸`; opens a nested popover
    - `{ strip: [{ text?, icon?: svgString, title, active?: boolean, action }] }` → row of equal-width buttons (`.ctx-strip`), `active` gets the accent border like `.app-menu-theme button.active`; `title` doubles as `aria-label`
    - `{ section: string }` → small uppercase label (`.ctx-section`)
    - `{ info: string, mono?: boolean }` → muted non-interactive line (`.ctx-info`), ellipsis on overflow
    - `'sep'` → `.app-menu-sep`
  - The root element has classes `app-menu ctx-menu` and `popover="auto"`, appended to `body` once.

- [ ] **Step 1: Implement.** Behaviour pinned by the spec:
  - Position is set **before** `showPopover()` (no top-left flash): at `(x, y)`, then measured; if it overflows right/bottom, flip to the left of / above the point; clamp to an 8px margin.
  - Submenu: nested popover element inside the parent menu (so it keeps the parent open), opened on hover (150 ms), click, Enter or →; placed right of its row, left if no room; ← or Esc closes only the submenu.
  - ↑/↓ move focus between enabled buttons (wrapping), Home/End first/last; the first button gets focus on open. Clicking an item closes all menus, then runs `action()`.
  - Esc and outside click close (popover light dismiss).
- [ ] **Step 2: Styles** — `.ctx-menu { min-width: 240px; max-height: calc(100vh - 16px); overflow-y: auto }`, `.ctx-strip`, `.ctx-section`, `.ctx-info`, submenu arrow; colours only from theme variables.
- [ ] **Step 3: Verify** in the dev server: `const m = await import('/mkdn/src/ui/context-menu.js'); m.openContextMenu(innerWidth - 5, innerHeight - 5, [{label:'A', action(){}}, 'sep', {label:'Sub', submenu:[{label:'B', action(){}}]}])` → the menu's `getBoundingClientRect()` is fully inside the window; hovering `Sub` shows `B` beside it without closing the parent; Esc closes. Switch to dark theme (☰) and take a screenshot: text readable.
- [ ] **Step 4: Commit** — `feat(ui): add a popover context menu`

### Task 4: Clipboard module, desktop clipboard plugin, editor wiring, Selection + Default menus

**Files:**
- Create: `src/editor/clipboard.js`
- Create: `src/editor/editor-context-menu.js`
- Modify: `src/editor/milkdown-setup.js` (listener install + `runCommand` + `selectionToMarkdown`)
- Modify: `src/find-replace/find-bar.js:281` (`openFindBar` takes a query)
- Modify: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json` (clipboard plugin)

**Interfaces:**
- Consumes: Task 3 `openContextMenu`, Task 2 helpers.
- Produces:
  - `milkdown.runCommand(key, payload?): boolean` — `crepe.editor.action(callCommand(key, payload))` (`callCommand` from `@milkdown/utils`).
  - `milkdown.selectionToMarkdown(): string` — the selection's slice serialized with `serializerCtx` (inline content wrapped in a paragraph first).
  - `openFindBar(withReplace = false, query?: string)` — when `query` is given it replaces the search input value before searching.
  - `clipboard.js`: `cut()`, `copy()` (`document.execCommand`), `paste(view): Promise<void>` (browser: `navigator.clipboard.read()` → `view.pasteHTML(html)` if `text/html`, else `view.pasteText(text)`; desktop: plugin `readText()` → `view.pasteText`), `pastePlain(view): Promise<void>` (text inserted verbatim with `tr.insertText`), `writeClipboard({ html?, text }): Promise<void>` (browser `ClipboardItem`; desktop `writeHtml(html, text)` / `writeText(text)`). Any failure → `toast('Use Ctrl+V to paste', 'info')` for paste, `toast('Copy failed', 'error')` for writes.
  - `editor-context-menu.js`: `openEditorMenu(view, x, y, target): void` and `detectContext(view): { kind: 'selection'|'link'|'image'|'table'|'heading'|'default', … }`, plus per-kind builders `selectionItems(ctx)`, `defaultItems(ctx)` (later tasks add `linkItems`, `headingItems`, `tableItems`, `imageItems`).

- [ ] **Step 1: Desktop plugin.** `npm install @tauri-apps/plugin-clipboard-manager@^2`; `tauri-plugin-clipboard-manager = "2"` in Cargo.toml; `.plugin(tauri_plugin_clipboard_manager::init())` in `lib.rs`; capabilities `clipboard-manager:allow-read-text`, `clipboard-manager:allow-write-text`, `clipboard-manager:allow-write-html`, `clipboard-manager:allow-write-image`. `cd src-tauri && cargo check` passes.
- [ ] **Step 2: Listener in `milkdown-setup.js`** (after `crepe.create()`): track the last `pointerdown` `pointerType`; on `contextmenu` return early (native menu) for Shift, touch, source mode, or a target inside `.cm-editor` / `input` / `textarea`; otherwise `preventDefault()`, move the cursor to `view.posAtCoords` unless the point is inside the current non-empty selection, and `import('./editor-context-menu.js').then(m => m.openEditorMenu(view, x, y, target))`. Keyboard-opened menus (context-menu key / Shift+F10, `e.button !== 2` and zero coordinates) open at `view.coordsAtPos(selection.head)`.
- [ ] **Step 3: Selection + Default menus** exactly as listed in the spec (Selection: format strip with `toggleStrongCommand`, `toggleEmphasisCommand`, `toggleStrikethroughCommand`, `toggleInlineCodeCommand`, Link… → `openLinkPopover()`; Turn into → `turnIntoTextCommand`, `wrapInHeadingCommand` 1–3, `wrapInBlockquoteCommand`, `wrapInBulletListCommand`, `wrapInOrderedListCommand`, task list = bullet list then `setNodeMarkup` on the list item with `checked: false`, `createCodeBlockCommand`; Find "…" label truncated to 20 chars + `…`; Search the web → `https://www.google.com/search?q=` + encoded selection via `openExternal(url)` (desktop: `@tauri-apps/plugin-shell` `open`; browser: `window.open(url, '_blank', 'noopener')`) — put `openExternal` in `editor-context-menu.js`. Default: Insert → `insertTableCommand` `{ row: 3, col: 3 }`, task list, code block, quote, `insertHrCommand`, today's date `new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })`; Copy document as rich text → `writeClipboard({ html: DOMSerializer.fromSchema(schema).serializeFragment(doc.content) as HTML string, text: documentStore.getMarkdown() })`; Find and replace / Source view / Version history call what `keyboard-shortcuts.js` calls.
- [ ] **Step 4: Verify** with the DevTools snippet. MD = `'# Trip\n\nBook the train before Friday.\n\n\`\`\`js\nlet a = 1\n\`\`\`\n'`.
  - On `p` → items start with `Paste`, `Paste as plain text`, include `Insert`, `Copy document as rich text`.
  - Select "the train" (DOM range) and right-click inside it → strip titles `Bold…`, includes `Copy as Markdown`, `Turn into`; selection still "the train" afterwards.
  - Right-click inside `.cm-editor` → returned event `defaultPrevented === false`, no `.ctx-menu:popover-open`.
  - Click Bold → markdown contains `**the train**`; Ctrl+Z → back.
  - Copy document as rich text → `await navigator.clipboard.read()` has `text/html` containing `<h1>`.
  - `npm run build` passes; the startup chunk (`dist/assets/index-*.js`) doesn't contain the string `Copy document as rich text`.
- [ ] **Step 5: Commit** — `feat(editor): add a right-click menu for selections and text` (include the Tauri plugin files).

### Task 5: Link and Heading menus

**Files:**
- Modify: `src/editor/editor-context-menu.js`
- Modify: `src/ui/link-popover.js` (`openLinkPopover(anchor?, { text?, url? } = {})`: prefill both inputs, header "Edit link" when `url` given)

**Interfaces:**
- Consumes: `slugify` (Task 2), `openExternal`, `runCommand`, `writeClipboard` (Task 4), `fileSaver.openHandle(path)`, `isTauri()` (`src/platform/tauri-bridge.js`), `TEXT_EXTENSIONS`.
- Produces: `linkItems(ctx)`, `headingItems(ctx)`; `ctx` for link = `{ kind: 'link', href, from, to }` (mark range), heading = `{ kind: 'heading', level, pos, node }`.

- [ ] **Step 1: Link menu.** Info line = href (mono). Open item by href:
  - `http:`, `https:`, `mailto:` → "Open link" → `openExternal`.
  - `#slug` → "Go to section" → first heading with `slugify(text) === slug`: `TextSelection` inside it, `scrollIntoView`, focus; toast "Section not found" otherwise.
  - relative path with an extension in `TEXT_EXTENSIONS` (ignore `#…`), desktop and current `fileId` an absolute path → "Open in a new tab" → resolve with `@tauri-apps/api/path` `resolve(dirname(fileId), decodeURI(path))` → `fileSaver.openHandle(resolved)`; errors → toast. Browser: no item.
  - Edit link… → select `from..to`, `openLinkPopover(undefined, { text, url: href })`. Copy link address → `writeClipboard({ text: href })`. Remove link → `tr.removeMark(from, to, schema.marks.link)`.
- [ ] **Step 2: Heading menu.** Strip `¶ H1 H2 H3 H4` (active = current level) → `turnIntoTextCommand` / `wrapInHeadingCommand(level)`; "Copy link to section" with hint `#slug` (mono) → `writeClipboard({ text: '#' + slug })`; "Select section" → from heading start to the next heading with level ≤ this one (or doc end).
- [ ] **Step 3: Verify.** MD = `'## Day 2 — Lyon\n\nSee [budget](./budget.md), [site](https://example.com) and [day 2](#day-2--lyon).\n\nText\n\n## Day 3\n'`.
  - On `h2` → strip with H2 active, `Copy link to section` hint `#day-2--lyon`; Select section → `getSelectedText()` contains "Text", not "Day 3".
  - On the `https` link → `Open link`, `Edit link…`, `Copy link address`, `Remove link`; Remove link → markdown has `site` without `](`; Ctrl+Z restores it.
  - On `#day-2--lyon` link → `Go to section` moves the cursor into the first heading.
  - On `./budget.md` in the browser → no open item.
- [ ] **Step 4: Commit** — `feat(editor): add link and heading right-click menus`

### Task 6: Table and Image menus

**Files:**
- Create: `src/editor/table-ops.js`
- Modify: `src/editor/editor-context-menu.js`

**Interfaces:**
- Consumes: `sortRows`, `toTsv` (Task 2), `runCommand`, `writeClipboard`, `openExternal` (Task 4).
- Produces:
  - `table-ops.js`: `tableRows(table: Node): string[][]` (cell `textContent`), `sortTable(view, tablePos: number, col: number, dir: 1 | -1): void` (header row stays first; body rows reordered with `sortRows`; one `replaceWith` transaction), `deleteTable(view, tablePos: number): void`.
  - `tableItems(ctx)`, `imageItems(ctx)`; table ctx = `{ kind: 'table', tablePos, table, row, col, align }`, image ctx = `{ kind: 'image', pos, node }`.

- [ ] **Step 1: Table menu** per the spec. Rows: `addRowBeforeCommand`, `addRowAfterCommand`, delete row = `selectRowCommand({ index: row })` + `deleteSelectedCellsCommand`. Column section label `Column "<header cell text>"`: `addColBeforeCommand`, `addColAfterCommand`, align strip → `setAlignCommand('left'|'center'|'right')` with the current one active, Sort ascending / descending → `sortTable`, delete column = `selectColCommand({ index: col })` + `deleteSelectedCellsCommand`. Copy for spreadsheet → `writeClipboard({ text: toTsv(tableRows(table)) })`. Delete table → `deleteTable`.
- [ ] **Step 2: Image menu** (image-block or inline `image`): Copy image (fetch `src` → blob; non-PNG converted to PNG through `createImageBitmap` + canvas; `navigator.clipboard.write`; desktop plugin `writeImage`; on failure copy `src` as text and toast "Copied the image address"); Save image as… (browser: `<a download>` on an object URL; desktop: `@tauri-apps/plugin-dialog` `save` + `@tauri-apps/plugin-fs` `writeFile`), filename = last path segment of `src` when it's a URL/path, else `image.<subtype of blob.type>`; Open image in a new window only for `http(s)` → `openExternal`; Remove image → delete the node; then Cut · Copy · Paste.
- [ ] **Step 3: Verify.** MD = `'| City | Cost |\n|---|---|\n| Paris | 310 € |\n| Lyon | 275 € |\n| Nice |  |\n\n![](https://example.com/a.png)\n'`.
  - On a `td` → sections `Row`, `Column "Cost"`; Sort ascending on Cost → body order Lyon, Paris, Nice (empty last), header still first; one Ctrl+Z restores the original order.
  - Delete row on "Lyon" → 2 body rows; Ctrl+Z restores.
  - Copy for spreadsheet → clipboard text `City\tCost\nParis\t310 €\n…`.
  - On the image → `Copy image`, `Save image as…`, `Open image in a new window`, `Remove image`.
  - `npm run build` passes.
- [ ] **Step 4: Commit** — `feat(editor): add table and image right-click menus`

### Task 7: Docs and changelog

**Files:**
- Modify: `AGENTS.md` (Module Map `editor/` row: mention the right-click menu; one short "Right-click menu" paragraph under Architecture: listener in `milkdown-setup.js`, everything else lazy; native menu cases)
- Modify: `CHANGELOG.md` (`## [Unreleased]` → `### Added`)

- [ ] **Step 1: CHANGELOG entry** — `- **Right-click menu** — adapts to what you click: format or turn the selection into a heading/list, open/edit/copy links, change heading level or copy a link to a section, add/delete/sort table rows and columns or copy a table for a spreadsheet, copy/save images, insert tables, task lists and today's date, copy the whole document as rich text. Shift+right-click gives the browser menu.`
- [ ] **Step 2: AGENTS.md** as above.
- [ ] **Step 3: Commit** — `docs: document the right-click menu`
