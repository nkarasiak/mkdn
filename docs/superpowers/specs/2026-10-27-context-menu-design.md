# Right-click menu — design

Mockups: https://claude.ai/artifact/WrQesEmyRha8U1TRj2AEi4 (6 boards; *Show in folder*, *Create file*, *Move section up/down*, *Save pasted image as a file*, *Insert ▸ Image from file* and *Copy section as Markdown* are **not** in this version).

## Why

Right-click in the editor shows the browser's generic menu, which does almost nothing useful in a WYSIWYG markdown editor (spellcheck is off, so no suggestions either). mkdn has no toolbar by design, so a menu that adapts to what's under the cursor is where formatting, table editing and copy-for-elsewhere can live without adding chrome. It must stay out of the way: no new visible UI until you right-click.

## Goals

- Right-click in the WYSIWYG editor opens an mkdn menu whose content depends on what was clicked: **selected text, link, heading, table cell, image, anything else** (plain paragraph / empty line).
- Every menu keeps **Cut / Copy / Paste** so the basics never disappear.
- Looks exactly like the ☰ menu (`.app-menu` styles, light/dark themes, native `popover`).

## Non-goals

- Source mode (Ctrl+U): keeps the browser's native menu.
- **Shift+right-click** always gives the native menu (escape hatch, e.g. for browser extensions or inspect).
- No new keyboard shortcuts (the menu shows the existing ones).
- No settings to turn it on/off.

## Anti-goals

- Startup cost: the menu module must not be in the startup bundle (dynamic import on first right-click, like the link popover / history panel).
- A menu that feels foreign: no icons-everywhere, no animations, no colours beyond the theme.

## Context detection (where the right-click landed)

Right-click moves the cursor to the clicked spot unless it lands inside the current selection (then the selection is kept — standard editor behaviour). Then, first match wins:

1. Non-empty text selection → **Selection**
2. Inside a link mark → **Link**
3. On an image → **Image**
4. Inside a table cell → **Table**
5. Inside a heading → **Heading**
6. Otherwise → **Default**

## Menus

Shortcut hints are written `Ctrl+…` on every platform, like the ☰ menu.

### Selection
- Format strip (icon buttons, active state when the mark is on): **Bold, Italic, Strikethrough, Inline code, Link…** (Link… opens the existing link popover, Ctrl+L)
- Cut · Copy · Paste
- **Copy as Markdown** — the selection serialized to markdown, `text/plain` only
- **Turn into ▸** — Paragraph, Heading 1, Heading 2, Heading 3, Quote, Bulleted list, Numbered list, Task list, Code block
- **Find "…"** (Ctrl+F) — opens the find bar prefilled with the selection (truncated in the label to ~20 chars)
- **Search the web** — Google search for the selection, opened in the system browser

### Link
- Header line: the link target, monospace, truncated
- **Open link** — `http(s)`/`mailto`: system browser. A relative link to a text file (`TEXT_EXTENSIONS`) in the desktop app: **Open in a new tab** (resolved against the current document's folder, opened with `fileSaver.openHandle(path)`). Relative file links in the browser: item hidden (no folder access there).
- **Edit link…** (Ctrl+L) — existing link popover, prefilled with the link's text and URL; submitting replaces that link
- **Copy link address**
- **Remove link** — removes the link mark, keeps the text
- Cut · Copy · Paste

### Heading
- Level strip: **¶ H1 H2 H3 H4**, current level highlighted (accent border, like the theme buttons in ☰)
- **Copy link to section** — copies `#slug` (GitHub-style slug: lowercase, spaces → `-`, punctuation stripped); shows the slug as the item's hint
- **Select section** — selects from the heading to just before the next heading of the same or higher level (or end of document)
- Cut · Copy · Paste

### Table (cell)
- Section label **Row**: Insert above · Insert below · Delete row
- Section label **Column "<header text>"**: Insert left · Insert right · alignment strip (left / centre / right, current one highlighted) · **Sort ascending** / **Sort descending** · Delete column
- **Copy for spreadsheet** — whole table as TSV (`text/plain`), pastes into Excel / Sheets / LibreOffice as cells
- **Delete table**
- Sort: header row stays first; compares cell text with `localeCompare(…, { numeric: true, sensitivity: 'base' })` so `9 < 10` and `275 €` sorts as a number; empty cells last. One undo step.

### Image
- **Copy image** — image bytes to the clipboard (`ClipboardItem` with the image blob); falls back to copying the URL/data URI as text if the browser refuses
- **Save image as…** — downloads it (browser) / save dialog (desktop), filename from alt text or `image.png`
- **Open image in a new window** — only for `http(s)` sources
- **Remove image**
- Cut · Copy · Paste

### Default (paragraph, empty line, anything else)
- Paste · **Paste as plain text** (Ctrl+Shift+V)
- **Insert ▸** — Table (3×3), Task list, Code block, Quote, Divider, **Today's date** (locale long format, e.g. "27 Oct 2026", inserted as text), Link… (Ctrl+L)
- Select all (Ctrl+A)
- **Copy document as rich text** — whole document as `text/html` + markdown as `text/plain`, so it pastes formatted into email, Google Docs, Slack
- Find and replace (Ctrl+H) · Source view (Ctrl+U) · Version history… (Ctrl+Shift+H)

## Decided

- **Clipboard**: Cut/Copy go through the editor (`document.execCommand('cut'|'copy')` from the click, so ProseMirror's own clipboard handling runs). Paste reads `navigator.clipboard.read()` and feeds HTML to `view.pasteHTML` / text to `view.pasteText` (keeps smart paste / markdown parsing); Paste as plain text inserts `readText()` verbatim. If the clipboard API is refused (permission / Firefox), show a toast "Use Ctrl+V to paste".
- **Rich HTML** (Copy document as rich text): ProseMirror `DOMSerializer.fromSchema(schema)` on the document — clean semantic HTML, no editor classes. Not the export module's hand-written converter.
- **Submenus** (Turn into, Insert): a nested `popover` opening to the right of its row on hover or click/Enter/→, flipping left when there's no room. Opening one keeps the parent open (popover nesting).
- **Positioning**: at the pointer, clamped inside the window (flip up/left when it would overflow). Set position before showing (lesson from the ☰ flash: `beforetoggle`, or set style before `showPopover()`).
- **Keyboard**: menu items are real `<button>`s. ↑/↓ move focus, → / Enter open a submenu, ← / Esc close it, Esc closes the menu (popover gives Esc + light dismiss). The context-menu key / Shift+F10 opens the menu at the cursor.
- **Editor commands**: use Milkdown's commands where they exist (`toggleStrongCommand`, `wrapInHeadingCommand`, `addRowBeforeCommand`, `setAlignCommand`, `insertTableCommand`, `insertHrCommand`, …). Custom ProseMirror transactions only for: sort, TSV, select section, slug, remove link, alt text.
- **External links in the desktop app**: `@tauri-apps/plugin-shell` `open()` (already installed and allowed); browser: `window.open(url, '_blank', 'noopener')`.
- Every action that changes the document is one undo step and goes through the normal editor → store sync (no direct store writes).

### Settled after review (my calls)

- **Code blocks** (CodeMirror) and anything else ProseMirror doesn't own (image caption input, table handles): the **native menu**. The context check bails out when the click target is inside a node view's own DOM.
- **Touch**: mouse and keyboard only. A `contextmenu` that follows a touch `pointerdown` keeps the native callout.
- **Links to `#slug`** in the same document: **Go to section** scrolls to and puts the cursor on the matching heading (shares the slug function with *Copy link to section*). `other.md#slug` opens the file's tab and ignores the anchor.
- **Image menu**: no *Edit description* in this version. Most images are Crepe image blocks, which have no alt attribute (see the alt-text bug below). *Save image as…* names the file after the last segment of `src` when it's a URL or path, otherwise `image.<ext from MIME>`.

### Decided by the author after review

- **Desktop paste**: add `@tauri-apps/plugin-clipboard-manager` (JS + Rust plugin + capability) so menu Paste / Paste as plain text work in the desktop app, where WebKitGTK blocks `navigator.clipboard.read()`. The plugin only reads text, so desktop Paste reads text and lets the editor parse it as markdown.
- **Alt-text bug, fixed first as its own commit**: Crepe's image block reads a standalone image's alt as its size ratio and writes the ratio back (`![Sunset](photo.png)` saves as `![1.00](photo.png)`). The fix must keep the markdown alt through load → save unchanged; the resize ratio may be dropped (mkdn doesn't persist image sizes).

## Left to the builder

- Module split (likely one `src/editor/context-menu.js` + styles in `toolbar.css` next to `.app-menu`), function names, exact icon SVGs (match the stroke style of `toolbar/icons`).
- Whether the format strip uses the existing icon set or text glyphs (B / I / S / `</>`) as in the mockup.
- How to find the link/image/table node from the click position (`view.posAtCoords` + resolve).
- Testing approach: there's no test runner; verify in the dev server with the Chrome DevTools MCP (each context, light + dark, a narrow window) and `npm run build`.
