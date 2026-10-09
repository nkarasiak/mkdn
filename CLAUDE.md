# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

mkdn is a browser-based WYSIWYG markdown editor. It's a vanilla JavaScript SPA (no framework) built with Vite, using Milkdown (Crepe/ProseMirror) for editing. Supports local folder sync via the File System Access API, multiple document tabs, and version history via IndexedDB. Also ships as a Tauri v2 desktop app (`src-tauri/`).

## Commands

- `npm run dev` — Start dev server on port 3000
- `npm run build` — Production build to `dist/`
- `npm run preview` — Preview production build on port 3000

There are no tests or linting configured.

## Deployment

Deploys to GitHub Pages via `.github/workflows/deploy.yml` on push to `main`. The Vite `base` is set to `/mkdn/`.

## Commits & Versioning

Follow **Conventional Commits** and **Semantic Versioning**.

### Commit format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**Types:** `feat`, `fix`, `refactor`, `style`, `docs`, `chore`, `perf`, `test`, `ci`, `build`.

**Scopes** (optional): `editor`, `sidebar`, `toolbar`, `history`, `save`, `local`, `storage`, `ui`, `styles`, `tabs`, `backlinks`, `themes`, `export`, `stats`, `focus`, `command-palette`.

**Examples:**
- `feat(history): add checkpoint message support`
- `fix(save): handle cancelled file picker gracefully`
- `refactor(sidebar): extract section component`

### Breaking changes

Add `!` after the type/scope and a `BREAKING CHANGE:` footer.

### Version bumps

- `fix` → patch, `feat` → minor, `BREAKING CHANGE` → major

The version lives in `package.json`. Update it manually when releasing.

### CHANGELOG.md

Maintain `CHANGELOG.md` in Keep a Changelog format. Group entries under `### Added`, `### Changed`, `### Fixed`, `### Removed`. Each release gets a `## [x.y.z] - YYYY-MM-DD` heading.

## Architecture

### No Framework — Imperative DOM

All UI is built with a custom `el()` helper (`src/utils/dom.js`) that creates DOM elements imperatively. There is no virtual DOM, no components, no JSX. Modules export factory functions (e.g., `createToolbar()`, `createSidebar()`) that return raw DOM elements.

The `el()` helper accepts:
- `className` (string), `style` (object), `dataset` (object)
- `on<Event>` attributes (e.g., `onClick`) → `addEventListener`
- `unsafeHTML` → `innerHTML` (used for SVG icons)

### App Bootstrap (main.js → app.js)

`main.js` imports CSS in order then calls `App.init()`. The init sequence:
1. Apply theme, create DOM structure (editorPane, sidebar, toolbar, statusbar)
2. `focusManager.init()` → `sessionStore.restoreSession()` → `milkdown.init()` → `localSync.init()` → `sessionStore.init()` → `historyManager.init()`
3. `initTabs()` (after milkdown init), then register commands: builtin, export
4. Initialize backlinks, writing stats, theme editor

### Event Bus + Stores (Pub/Sub State Management)

State flows through stores and a central event bus. All cross-module communication goes through `eventBus` (`on`/`emit`/`off`).

- **`store/document-store.js`** — Current document state (markdown, fileName, fileId, dirty flag).
- **`store/settings-store.js`** — User preferences persisted to localStorage. Emits `settings:<key>` on change.

When modifying state, always go through the stores — never mutate DOM directly for state that other modules depend on.

#### Key Events

| Event | Payload | Source |
|-------|---------|--------|
| `content:changed` | `{ content, source }` | documentStore |
| `file:opened` | `{ id, name, source }` | documentStore |
| `file:new` | `{}` | documentStore |
| `file:saved` | `{ fileName, lastSaved }` | documentStore |
| `file:renamed` | `{ name }` | documentStore |
| `document:will-change` | — | documentStore (before `setFile`/`newDocument`; milkdown flushes pending edits) |
| `tabs:changed` | `{ tabs, activeTabId }` | tabStore |
| `settings:<key>` | `(value)` | settingsStore |
| `history:updated` | `{}` | historyManager |
| `history:restored` | `{ id }` | historyManager |
| `local:folder-linked` | `{ name }` | localSync |
| `local:folder-unlinked` | `{}` | localSync |
| `local:files-updated` | `{ files }` | localSync |
| `focus:refresh-plugins` | `{}` | focusManager |

### Critical Pattern: Echo Loop Prevention

The `content:changed` event carries a `source` field (`'milkdown'`, `'file-open'`, `'new-document'`, `'session-restore'`, `'history-restore'`). Listeners **must** check source to avoid feedback loops:

```javascript
eventBus.on('content:changed', ({ source }) => {
  if (source === 'milkdown') return; // don't re-render back into milkdown
  milkdown.setContent(value);
});
```

Additionally, `milkdown-setup.js` uses an `updating` flag: when `setContent()` is called, the `markdownUpdated` callback is suppressed to prevent re-emitting.

### Editor (Milkdown/ProseMirror)

The editor is a Milkdown Crepe instance (ProseMirror under the hood). Key methods on the `milkdown` singleton:

- `init(container)` — Async, registers all ProseMirror plugins
- `getMarkdown()` / `setContent(markdown)` — Read/write content
- `getView()` — Access underlying ProseMirror EditorView
- `runCommand(cmdKey, payload)` — Execute Milkdown commands
- `getCursorAsMarkdownOffset(md)` / `setCursorFromMarkdownOffset(md, offset)` — Map cursor between ProseMirror positions and markdown character offsets (used for source mode cursor sync)

**ProseMirror plugins registered**: paragraph focus, typewriter, embed, find-replace, wikilink, image paste, mermaid, callout, emoji, details.

### Dual Editor Modes

Source mode (Ctrl+U) swaps the ProseMirror editor for a raw markdown textarea. All toolbar format commands are mapped to `sourceFormat` helpers that manipulate the textarea text directly. Cursor position is preserved across mode switches via the markdown offset mapping.

### Command Palette & Registry

All user actions are registered as commands in `command-palette/command-registry.js`:

```javascript
commandRegistry.register({
  id: 'file:save',
  label: 'Save',
  category: 'File',
  shortcut: 'Ctrl+S',     // display only
  keywords: ['save', 'write'],
  action: () => {}
});
```

The palette supports prefix modes: empty for all commands, `>` to filter, `#` to jump to headings. Recent commands are tracked in localStorage.

Commands are registered in `app.js` via `registerBuiltinCommands()` and `registerExportCommands()`.

### Tabs & Files

`store/tab-store.js` owns the tab list; `documentStore` holds only the active document. Rules:
- Switch/close/reopen tabs only through `tabStore.switchTab/closeTab/reopenTab/nextTab/prevTab` — they load the tab via `documentStore.setFile(..., mtime, dirty)`. Never call `setFile` with a tab's content yourself.
- `file:opened` / `file:new` → `tabStore.openTab()` syncs (or creates) the tab from `documentStore`, so a tab's `dirty`/`mtime` always mirror the document.
- File ids: linked-folder files use their relative path; standalone files use the absolute path (Tauri) or `picked:<name>` (browser). `local-sync.js` keeps a `fileId → handle` map, so every tab saves to its own file. Files without a handle (drag-drop, plain `<input type=file>`) have `source: null` and Save asks for a location.
- Tauri: files passed at launch are pulled with `invoke('initial_file')`; later ones arrive via the `file-open` event (single-instance).

### Settings Auto-Reset

On page load, `settingsStore` always resets: `sidebarOpen=false`, `zenMode=false`, `paragraphFocus=false`, `typewriterMode=false`, `sourceMode=false`. Design features knowing these won't persist across reloads.

### Focus Modes

Cycle through modes via Ctrl+Shift+F: Normal → Zen → Zen+ParagraphFocus → Zen+ParagraphFocus+Typewriter → Normal. Zen hides sidebar/toolbar (reveal on mouse-to-top, Esc to exit). ParagraphFocus dims non-active paragraphs via decorations. Typewriter locks the active line to center.

### Storage Layers

| Layer | Purpose | Key prefix |
|-------|---------|-----------|
| localStorage | Settings, session, tabs (`mkdn-tabs`), theme, recent commands | `mkdn-*` |
| IndexedDB (`mkdn-history`) | History snapshots (max 50/file, pruned) | fileKey + timestamp |
| File System Access API | Linked local folder I/O | FileHandle objects |

### CSS

Styles in `src/styles/`, imported in order by `main.js`. Theming uses CSS custom properties in `variables.css` with `[data-theme="light"]` / `[data-theme="dark"]` selectors. Some modules inject `<style>` at runtime (toast, modal, command palette). Theme editor allows custom accent colors, fonts, and presets (default, ocean, forest, sunset, lavender, mono) with CSS injection validated against whitelists.

### Module Map

| Directory | Purpose | Pattern |
|-----------|---------|---------|
| `store/` | eventBus, documentStore, settingsStore, tabStore | Singletons |
| `editor/` | Milkdown setup + ProseMirror plugins | Singleton + plugin factories |
| `local/` | File System Access API, folder sync | Singletons |
| `save/` | File save/open dialogs | Singleton |
| `history/` | Snapshots, versioning, diff | Singleton + IndexedDB |
| `storage/` | IndexedDB, localStorage, sessionStorage, handle-store | Utility modules |
| `toolbar/` | Header toolbar UI | Factory function |
| `sidebar/` | File tree, outline, backlinks, history panels | Factory function |
| `ui/` | Modal, toast, status bar, link popover, keyboard shortcuts | Factory functions |
| `command-palette/` | Command registry, fuzzy match, heading jump | Singleton + factory |
| `find-replace/` | Find/replace with decorations (both modes) | Plugin + engines |
| `focus/` | Zen, paragraph focus, typewriter modes | Singleton + plugins |
| `backlinks/` | Wikilink `[[page]]` parsing, backlink resolution | Engine + UI + plugin |
| `themes/` | Theme editor with presets | Modal UI |
| `stats/` | Word count, readability, reading time | Modal UI |
| `export/` | HTML (themed), print/PDF, Markdown download | Command registrations |
| `utils/` | `el()`, `svgIcon()`, `$`/`$$`, `debounce` | Utility functions |
