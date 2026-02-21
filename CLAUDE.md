# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

DownToMark is a browser-based markdown editor with Google Drive sync. It's a vanilla JavaScript SPA (no framework) built with Vite, using CodeMirror 6 for source editing, Milkdown (Crepe) for WYSIWYG editing, and Marked + highlight.js + DOMPurify for preview rendering.

## Commands

- `npm run dev` — Start dev server on port 3000
- `npm run build` — Production build to `dist/`
- `npm run preview` — Preview production build on port 3000

There are no tests or linting configured.

## Deployment

Deploys to GitHub Pages via `.github/workflows/deploy.yml` on push to `main`. The Vite `base` is set to `/downtomark/`.

## Architecture

### No Framework — Imperative DOM

All UI is built with a custom `el()` helper (`src/utils/dom.js`) that creates DOM elements imperatively. There is no virtual DOM, no components, no JSX. Modules export factory functions (e.g., `createToolbar()`, `createSidebar()`, `createStatusBar()`) that return DOM elements.

### Event Bus + Stores (Pub/Sub State Management)

State flows through two stores and a central event bus:

- **`store/event-bus.js`** — Simple pub/sub (`on`/`emit`/`off`). All cross-module communication goes through here.
- **`store/document-store.js`** — Holds current document state (markdown content, file name, file ID, dirty flag). Emits `content:changed`, `file:opened`, `file:new`, `file:renamed`, `file:saved`.
- **`store/settings-store.js`** — Persists user preferences to localStorage (theme, viewMode, fontSize, sidebarOpen, autoSaveInterval). Emits `settings:<key>` events on change.

When modifying state, always go through the stores — never mutate DOM directly for state that other modules depend on.

### Three Editor Modes

The app has three view modes (`split`, `editor`, `wysiwyg`) switched via `settings:viewMode`:

1. **Split** — CodeMirror (left) + Marked HTML preview (right)
2. **Editor** — CodeMirror only
3. **WYSIWYG** — Milkdown Crepe (ProseMirror-based rich editor)

Content handoff between CodeMirror and Milkdown goes through `documentStore`. The `content:changed` event carries a `source` field (`'codemirror'`, `'milkdown'`, `'file-open'`, `'new-document'`) to prevent echo loops — each editor ignores events from itself.

### Google Drive Integration

- **`drive/auth.js`** — Google Identity Services OAuth2 token client. Requires `window.DOWNTOMARK_CLIENT_ID` or a hardcoded client ID.
- **`drive/drive-api.js`** — REST calls to Google Drive v3 API (list, get, create, update, rename, delete).
- **`drive/drive-sync.js`** — Orchestrates save/open/auto-save with offline fallback via IndexedDB cache (`storage/indexeddb.js`).

### Storage

- **IndexedDB** (`storage/indexeddb.js`) — Caches Drive files for offline access. Object store `files` keyed by Drive file ID.
- **localStorage** (`storage/local-storage.js`) — Generic key/value helper. Used by `settings-store` for user preferences.

### CSS

Styles are in `src/styles/`, imported in order by `main.js`. Theming uses CSS custom properties defined in `variables.css` with `[data-theme="light"]` / `[data-theme="dark"]` selectors. The CodeMirror theme (`editor/codemirror-theme.js`) references the same CSS variables for consistency. Some UI modules (toast, modal) inject their own `<style>` elements at runtime.
