# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

mkdn is a browser-based WYSIWYG markdown editor. It's a vanilla JavaScript SPA (no framework) built with Vite, using Milkdown (Crepe/ProseMirror) for editing. Supports local folder sync via the File System Access API and version history via IndexedDB.

## Commands

- `npm run dev` — Start dev server on port 3000
- `npm run build` — Production build to `dist/`
- `npm run preview` — Preview production build on port 3000

There are no tests or linting configured.

## Deployment

Deploys to GitHub Pages via `.github/workflows/deploy.yml` on push to `main`. The Vite `base` is set to `/mkdn/`.

## Commits & Versioning

Follow **Conventional Commits** (`https://www.conventionalcommits.org/`) and **Semantic Versioning** (`https://semver.org/`).

### Commit format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**Types:** `feat`, `fix`, `refactor`, `style`, `docs`, `chore`, `perf`, `test`, `ci`, `build`.

**Scopes** (optional): `editor`, `sidebar`, `toolbar`, `history`, `save`, `local`, `storage`, `ui`, `styles`.

**Examples:**
- `feat(history): add checkpoint message support`
- `fix(save): handle cancelled file picker gracefully`
- `refactor(sidebar): extract section component`
- `docs: update README with deployment instructions`
- `chore: bump vite to v6.2`

### Breaking changes

Add `!` after the type/scope and a `BREAKING CHANGE:` footer:

```
feat(save)!: remove browser-only save option

BREAKING CHANGE: the "Browser only" save option has been removed.
```

### Version bumps

- `fix` → patch (1.0.0 → 1.0.1)
- `feat` → minor (1.0.0 → 1.1.0)
- `BREAKING CHANGE` → major (1.0.0 → 2.0.0)

The version lives in `package.json`. Update it manually when releasing (no automated release tooling yet).

### CHANGELOG.md

Maintain `CHANGELOG.md` in Keep a Changelog format. Group entries under `### Added`, `### Changed`, `### Fixed`, `### Removed`. Each release gets a `## [x.y.z] - YYYY-MM-DD` heading.

## Architecture

### No Framework — Imperative DOM

All UI is built with a custom `el()` helper (`src/utils/dom.js`) that creates DOM elements imperatively. There is no virtual DOM, no components, no JSX. Modules export factory functions (e.g., `createToolbar()`, `createSidebar()`, `createStatusBar()`) that return DOM elements.

### Event Bus + Stores (Pub/Sub State Management)

State flows through two stores and a central event bus:

- **`store/event-bus.js`** — Simple pub/sub (`on`/`emit`/`off`). All cross-module communication goes through here.
- **`store/document-store.js`** — Holds current document state (markdown content, file name, file ID, dirty flag). Emits `content:changed`, `file:opened`, `file:new`, `file:renamed`, `file:saved`.
- **`store/settings-store.js`** — Persists user preferences to localStorage (theme, sidebarOpen, fontSize, autoSaveInterval). Emits `settings:<key>` events on change.

When modifying state, always go through the stores — never mutate DOM directly for state that other modules depend on.

### Editor

The app uses a single editor mode: **WYSIWYG** via Milkdown Crepe (ProseMirror-based rich editor). The `content:changed` event carries a `source` field (`'milkdown'`, `'file-open'`, `'new-document'`, `'session-restore'`, `'history-restore'`) to prevent echo loops.

### Local Folder Sync

- **`local/local-fs.js`** — File System Access API wrapper (open, save, rename, delete).
- **`local/local-sync.js`** — Orchestrates folder linking, file listing, and save/open operations.

### Storage

- **IndexedDB** (`storage/indexeddb.js`, `storage/history-db.js`) — Version history snapshots and offline file cache.
- **localStorage** (`storage/local-storage.js`) — User preferences via `settings-store`.
- **sessionStorage** (`storage/session-store.js`) — Persists editor state across page reloads.

### CSS

Styles are in `src/styles/`, imported in order by `main.js`. Theming uses CSS custom properties defined in `variables.css` with `[data-theme="light"]` / `[data-theme="dark"]` selectors. Some UI modules (toast, modal, history drawer) inject their own `<style>` elements at runtime.
