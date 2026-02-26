# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

mkdn is a browser-based WYSIWYG markdown editor. It's a vanilla JavaScript SPA (no framework) built with Vite, using Milkdown (Crepe/ProseMirror) for editing. Supports local folder sync via the File System Access API, real-time collaboration via PartyKit/Yjs, version history via IndexedDB, and a plugin system.

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

**Scopes** (optional): `editor`, `sidebar`, `toolbar`, `history`, `save`, `local`, `storage`, `ui`, `styles`, `collab`, `graph`, `backlinks`, `search`, `plugins`, `templates`, `themes`, `export`, `stats`, `focus`, `command-palette`.

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
3. Register all commands: builtin, export, collab, search, plugin, graph
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
| `settings:<key>` | `(value)` | settingsStore |
| `history:updated` | `{}` | historyManager |
| `history:restored` | `{ id }` | historyManager |
| `collab:started` | `{ roomId }` | collabManager |
| `collab:stopped` | `{}` | collabManager |
| `collab:peers-changed` | `{ peers }` | collabManager |
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

Commands are registered in `app.js` from multiple sources: `registerBuiltinCommands()`, `registerExportCommands()`, `registerCollabCommands()`, `registerSearchCommands()`, `registerPluginCommands()`, `registerGraphCommands()`.

### Collaboration (PartyKit + Yjs)

Real-time collaboration uses Yjs CRDT synced through a PartyKit server:
1. Creates `Y.Doc` + `YPartyKitProvider` connecting to the configured server
2. Applies `ySyncPlugin`, `yCursorPlugin`, `yUndoPlugin` to ProseMirror
3. Sessions joinable via URL hash `#s=${roomId}.${password}`
4. Collab session persists in sessionStorage for auto-reconnect on reload
5. History snapshots pushed to server on save/checkpoint

### Plugin System

Plugins (`src/plugins/`) load dynamically from URLs or local paths. Each plugin gets a sandboxed API via `createPluginAPI(pluginId)`:
- Event bus access (subscribe only), document read, plugin-namespaced settings/storage
- Command and slash command registration (auto-prefixed `plugin:${id}:`)
- Editor operations (getSelectedText, insertText, replaceSelection)
- Toast notifications

All plugin resources are namespaced: commands as `plugin:${id}:${cmd}`, settings as `plugin:${id}:${key}`, storage as `mkdn-plugin-${id}-${key}`. The `_cleanup()` method unsubscribes all listeners and removes commands.

### Settings Auto-Reset

On page load, `settingsStore` always resets: `sidebarOpen=false`, `zenMode=false`, `paragraphFocus=false`, `typewriterMode=false`, `sourceMode=false`. Design features knowing these won't persist across reloads.

### Focus Modes

Cycle through modes via Ctrl+Shift+F: Normal → Zen → Zen+ParagraphFocus → Zen+ParagraphFocus+Typewriter → Normal. Zen hides sidebar/toolbar (reveal on mouse-to-top, Esc to exit). ParagraphFocus dims non-active paragraphs via decorations. Typewriter locks the active line to center.

### Storage Layers

| Layer | Purpose | Key prefix |
|-------|---------|-----------|
| localStorage | Settings, session, templates, theme, recent commands | `mkdn-*` |
| sessionStorage | Collab session (room/password) | `mkdn-collab-*` |
| IndexedDB (`mkdn-history`) | History snapshots (max 50/file, pruned) | fileKey + timestamp |
| File System Access API | Linked local folder I/O | FileHandle objects |
| PartyKit server | Collaborative Yjs state | Remote |

### CSS

Styles in `src/styles/`, imported in order by `main.js`. Theming uses CSS custom properties in `variables.css` with `[data-theme="light"]` / `[data-theme="dark"]` selectors. Some modules inject `<style>` at runtime (toast, modal, command palette). Theme editor allows custom accent colors, fonts, and presets (default, ocean, forest, sunset, lavender, mono) with CSS injection validated against whitelists.

### Module Map

| Directory | Purpose | Pattern |
|-----------|---------|---------|
| `store/` | eventBus, documentStore, settingsStore | Singletons |
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
| `collab/` | PartyKit/Yjs real-time collaboration | Singleton |
| `backlinks/` | Wikilink `[[page]]` parsing, backlink resolution | Engine + UI + plugin |
| `graph/` | Force-directed knowledge graph (canvas-based) | Modal + physics engine |
| `search/` | On-device semantic search (Transformer.js embeddings) | Engine + IndexedDB vector store |
| `plugins/` | Plugin loader, registry, sandboxed API | Loader + factory |
| `templates/` | Built-in + custom document templates | Chooser UI |
| `themes/` | Theme editor with presets | Modal UI |
| `stats/` | Word count, readability, reading time | Modal UI |
| `export/` | HTML (themed), DOCX, slides, GitHub publish | Command registrations |
| `utils/` | `el()`, `svgIcon()`, `$`/`$$`, `debounce` | Utility functions |
