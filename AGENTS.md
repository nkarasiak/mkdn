# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

mkdn is a minimal, gedit-style WYSIWYG markdown editor. It's a vanilla JavaScript SPA (no framework) built with Vite, using Milkdown (Crepe/ProseMirror) for editing. Opens/saves real files via the File System Access API (or Tauri's fs plugin on desktop), keeps tabs and a session in local storage, and version history in IndexedDB. Keep it minimal: no toolbars, sidebars or panels — new features must earn their place.

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

**Scopes** (optional): `editor`, `toolbar`, `tabs`, `history`, `save`, `storage`, `ui`, `styles`, `export`, `find`, `tauri`, `pwa`.

**Examples:**
- `feat(history): add checkpoint message support`
- `fix(save): handle cancelled file picker gracefully`
- `refactor(toolbar): extract menu builder`

### Breaking changes

Add `!` after the type/scope and a `BREAKING CHANGE:` footer.

### Version bumps

- `fix` → patch, `feat` → minor, `BREAKING CHANGE` → major

The version lives in `package.json` only (`npm version X.Y.Z --no-git-tag-version` also updates `package-lock.json`). `src-tauri/tauri.conf.json` reads it via `"version": "../package.json"` — never hardcode a version there: it names the desktop release (`v__VERSION__`), and a stale one sent every desktop build from 2.4.0 to 3.1.3 into the old `v2.4.0` draft.

### Releasing

1. On `dev`: bump `package.json`, rename `[Unreleased]` → `## [x.y.z] - YYYY-MM-DD`, commit `feat|fix(release): bump version to x.y.z`.
2. Merge `dev` into `main` (`--no-ff`), tag `vx.y.z`, push `main --tags`, push `dev`. Pushing `main` deploys GitHub Pages; the tag runs `release-desktop.yml`.
3. `release-desktop.yml` builds Linux/Windows/macOS and creates a **draft** release `MKDN vx.y.z`. When it's done, publish it with the CHANGELOG section as notes and mark it **Latest**: `gh release edit vx.y.z --draft=false --latest --notes-file <notes>`. The desktop updater reads `releases/latest/download/latest.json`, so an unpublished draft means no desktop update. Not yet produced (as of 3.2.0): it needs `bundle.createUpdaterArtifacts: true` in `tauri.conf.json` and the `TAURI_SIGNING_PRIVATE_KEY` repo secret matching the updater `pubkey`.

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
1. Apply theme, create DOM: header bar (`toolbar/toolbar.js`), tab bar, editor pane + source textarea, status bar
2. `initTauri()` → `sessionStore.restoreSession()` → `milkdown.init()` (`milkdown-setup.js` is a dynamic import, preloaded from the HTML by the `preloadEditor` Vite plugin, so the shell paints first — keep it and ProseMirror out of static imports from the entry) → `initTabs()` → `fileSaver.init()` → `sessionStore.init()` → `historyManager.init()`
3. Find bar, source-mode toggle, keyboard shortcuts, PWA / Tauri file-open handlers

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
| `settings:<key>` | `(value)` | settingsStore |
| `history:updated` | `{}` | historyManager |
| `history:restored` | `{ id }` | historyManager |
| `tabs:changed` | `{ tabs, activeTabId }` | tabStore |

### Critical Pattern: Echo Loop Prevention

The `content:changed` event carries a `source` field (`'milkdown'`, `'file-open'`, `'new-document'`, `'session-restore'`, `'history-restore'`). Listeners **must** check source to avoid feedback loops:

```javascript
eventBus.on('content:changed', ({ source }) => {
  if (source === 'milkdown') return; // don't re-render back into milkdown
  milkdown.setContent(value);
});
```

Additionally, `milkdown-setup.js` uses an `updating` flag so its own `setContent()` isn't synced back, and skips `setContent()` for the markdown it already shows.

### Editor → store sync

The editor serializes to markdown lazily (on a typing pause; the first edit syncs at once for the `*`). `documentStore.getMarkdown()` / `getState()` / `setFile()` / `newDocument()` and the tab store flush pending edits first (`documentStore.setFlusher`), so any read sees the latest text.

### Startup snapshot

The editor's rendered HTML is saved to `mkdn-snapshot` (with its markdown) and painted inert by `app.js` while the editor chunk loads, only when it matches the restored document; the live editor replaces it in the same task.

### Editor (Milkdown/ProseMirror)

The editor is a Milkdown Crepe instance (ProseMirror under the hood). Key methods on the `milkdown` singleton:

- `init(container)` — Async; `CrepeBuilder` with only the features we use (no BlockEdit, Toolbar, Latex). Don't switch back to the `Crepe` class: it bundles every feature (KaTeX etc.) even when disabled
- `getMarkdown()` / `setContent(markdown)` — Read/write content
- `getView()` — Access underlying ProseMirror EditorView
- `getSelectedText()` / `insertLink(text, url)` — Used by the link popover (both modes)
- `getCursorAsMarkdownOffset(md)` / `setCursorFromMarkdownOffset(md, offset)` — Approximate (block-level) cursor mapping for source-mode switches

**ProseMirror plugins registered**: find-replace, image paste (inline base64), smart paste.

### Dual Editor Modes

Source mode (Ctrl+U) swaps the ProseMirror editor for a raw markdown textarea. Cursor position is preserved across mode switches via the markdown offset mapping. The status bar shows `Ln, Col` only in source mode (where it is exact).

### Files (save/file-saver.js)

`fileSaver` is the only file I/O module. It keeps one handle per document (`fileId → FileSystemFileHandle` in the browser, absolute path in Tauri), so each tab saves to its own file. Save without a handle falls back to Save As; without the File System Access API, Open uses `<input type=file>` and Save downloads. It also autosaves dirty documents that have a handle (30 s) and polls for changes on disk (5 s / window focus). `local/local-fs.js` wraps the browser API; `platform/tauri-fs.js` patches it with `@tauri-apps/plugin-fs` paths.

### Header bar & menu

`toolbar/toolbar.js` builds the gedit-style header: `Open`, `+`, centred title (`*` when dirty, directory subtitle for paths), `Save`, ☰. The ☰ menu is a native `popover` element (light-dismiss and Esc for free). In Tauri the header is also the frameless window's drag region and holds min/max/close.

### Settings Auto-Reset

Settings are just `theme`, `editorZoom` and `sourceMode`; `sourceMode` always resets to `false` on load.

### Storage Layers

| Layer | Purpose | Key prefix |
|-------|---------|-----------|
| localStorage | Settings, session, open tabs | `mkdn-*` |
| IndexedDB (`mkdn-session-db`) | Current session document | — |
| IndexedDB (`mkdn-history`) | History snapshots (max 50/file, pruned) | fileKey + timestamp |
| File System Access API / Tauri fs | Open/save real files | FileHandle / path (in memory only) |

### CSS

Styles in `src/styles/`, imported in order by `main.js`. Theming uses CSS custom properties in `variables.css` with `[data-theme="light"]` / `[data-theme="dark"]` selectors (light / dark / auto picked in the ☰ menu). Some modules inject `<style>` at runtime (toast, modal, tab bar, find bar, history).

### Module Map

| Directory | Purpose | Pattern |
|-----------|---------|---------|
| `store/` | eventBus, documentStore, settingsStore, tabStore | Singletons |
| `editor/` | Milkdown setup, zoom, paste plugins | Singleton + plugin factories |
| `save/` | File open/save/autosave/disk-change detection | Singleton |
| `local/` | File System Access API wrapper | Object (patched by Tauri) |
| `history/` | Snapshots, diff, history dialog | Singleton + IndexedDB |
| `storage/` | Session persistence, history DB, localStorage | Utility modules |
| `toolbar/` | Header bar, tab bar, icons | Factory functions |
| `ui/` | Modal, toast, status bar, link popover, keyboard shortcuts, about | Factory functions |
| `find-replace/` | Find/replace with decorations (both modes) | Plugin + engines |
| `export/` | Styled HTML export | Function |
| `platform/` | Tauri detection, fs patch, file-open events, updater | Functions |
| `pwa/` | PWA file-handler launch queue | Function |
| `utils/` | `el()`, `injectStyles()`, `debounce`, print/download | Utility functions |
