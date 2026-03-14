# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- **Offline Support** — app now works fully offline after first visit via Workbox-powered service worker that pre-caches all build assets and Google Fonts

### Fixed

- **Collab Security** — room key now sent via `X-Room-Key` header instead of URL query parameter (prevents leaking in logs/Referer)
- **Room ID Generation** — use `crypto.getRandomValues()` instead of `Math.random()` for cryptographically secure room IDs
- **CORS Restriction** — PartyKit server now allowlists specific origins instead of `Access-Control-Allow-Origin: *`
- **Plugin Sandbox** — added `e.source` verification in iframe message handler; documented opaque-origin `postMessage` requirement
- **Dependency Pinning** — all dependency versions pinned to exact installed versions

## [2.1.0] - 2026-02-26

### Added

- **Knowledge Graph** — force-directed canvas visualization of wiki-link connections between notes
- **Collab Session History** — server-side snapshots pushed on save/checkpoint
- **Callout Blocks** — `[!NOTE]`, `[!TIP]`, `[!WARNING]`, `[!CAUTION]`, `[!IMPORTANT]` rendered with icons
- **Details/Summary Blocks** — collapsible `<details>` sections in the editor
- **Emoji Picker** — type `:` to search and insert emoji inline

- **Backlinks / Wiki-style Linking** — `[[page-name]]` syntax for linking between notes
  - ProseMirror decoration plugin highlights wiki-links with accent color
  - Supports `[[page]]` and `[[page|display text]]` syntax
  - Sidebar backlinks panel showing incoming and outgoing links
  - Click-to-navigate on resolved links across linked folder
- **Writing Statistics Dashboard** — click word count in status bar to open
  - Word, character, sentence, and paragraph counts
  - Flesch-Kincaid readability score with level indicator
  - Read time estimate and session duration timer
- **Theme Editor** — customize editor appearance beyond light/dark
  - 6 color presets: Default, Ocean Blue, Forest Green, Sunset, Lavender, Monochrome
  - Accent color picker with live preview
  - Editor font selector (Spectral, System Sans, Georgia, Palatino, Courier, Monospace)
  - Font size, content width, and line height sliders
  - Export/import theme files as JSON
- **Template System** — create documents from pre-built templates
  - 8 built-in templates: Blank, Blog Post, Meeting Notes, Daily Journal, README, To-Do List, Weekly Review, Technical Spec
  - Save current document as custom template
  - Delete custom templates
- **Image Paste & Drop** — paste images from clipboard or drag-and-drop
  - Images stored inline as base64 data URIs
  - 5MB file size limit with warning toast
- **Mermaid Diagram Support** — render diagrams from `mermaid` code blocks
  - Lazy-loads Mermaid library from CDN on first use
  - Renders preview below code block with caching
  - Respects light/dark theme
- **Customizable Sidebar Layout** — configure which sections are visible
  - Settings gear button in sidebar header opens config modal
  - Toggle visibility of Local Folder, Outline, Backlinks, and History sections
  - Preferences persist in settings store
- Swipe gestures for sidebar on touch devices (swipe right from left edge to open, swipe left to close)

### Security

- **Plugin sandbox hardened** — plugin code is no longer interpolated into HTML template literals; delivered via `postMessage` instead, preventing `</script>` breakout attacks
- **Plugin ID validation** — only alphanumeric, dashes, underscores, dots allowed (max 128 chars)
- **postMessage source verification** — message handlers now verify `e.source` matches the expected iframe
- **GitHub publish input validation** — repo, path, and branch are validated before constructing API URLs; uses `URL` constructor with `encodeURI`
- **GitHub token moved to sessionStorage** — cleared when tab closes instead of persisting in localStorage; old tokens migrated and removed
- **URL sanitization in exports** — `javascript:`, `data:`, `vbscript:` schemes blocked in markdown-to-HTML link/image conversion (slides & HTML export)
- **Theme editor CSS injection prevention** — font values whitelisted, hex colors validated, numeric ranges enforced; imported themes sanitized
- **Mermaid SVG rendered safely** — uses `DOMParser` + `document.importNode()` instead of `innerHTML`
- **innerHTML clearing replaced** — `replaceChildren()` used across collab UI, search UI, and plugin manager
- **HTTPS enforcement for collab** — non-HTTPS server URLs rejected (localhost exempt for development)

### Changed

- **Vite code splitting** — milkdown (1.4MB) and collab (112KB) split into separate chunks for faster initial load
- **Lazy search indexing** — 23MB transformer model deferred until first search invocation
- **Debounced sidebar file search** — 150ms debounce prevents excessive re-renders on keystroke
- **Backlinks file caching** — content cache avoids re-reading all files on every backlink scan
- **Service worker cache** — version bumped to `mkdn-v2.1.0`
- **`injectStyles()` utility** — extracted common 3-line style injection pattern into shared helper (18 files)
- **Centralized storage keys** — all `mkdn-*` localStorage/sessionStorage/IndexedDB keys in `constants.js` (13 files)
- **Deduplicated collab username** — `getUserName()` exported from collab-manager, reused in collab-ui
- **Outline panel debounce** — imports shared `debounce()` instead of local copy
- **Removed unused exports** — `embedKey`, `extractYouTubeId`, `extractTweetId` made module-private
- **Removed stale Vue defines** — cleaned up `__VUE_OPTIONS_API__` flags from vite.config.js

### Removed

- Daily word goal (progress bar and configurable target) from Writing Statistics
- Writing streak tracking from Writing Statistics

### Fixed

- **Print / PDF export** — removed redundant file name title injection that produced unwanted text above content when printing
- Mobile horizontal overflow — text, lists, and blockquotes now wrap correctly on 375px viewports
- Stale "AI Assistant" keyboard shortcut removed from About modal

## [2.0.0] - 2026-02-24

### Added

- **Publish & Export Pipeline** — all transforms run in-browser
  - Styled HTML export with 4 themes (Minimal, Academic, Newspaper, Dark)
  - DOCX (Word) export via `docx` library with full formatting support
  - Slide deck presentation mode (split on `---`, fullscreen, keyboard nav)
  - Export slides as standalone HTML file
  - Publish to GitHub via Personal Access Token (browser → GitHub REST API)
- **Real-Time P2P Collaboration** — Yjs CRDT + WebRTC
  - One-click Share button starts session instantly (no modal)
  - Encrypted rooms with 256-bit password and 16-char room IDs
  - Obfuscated share URL (`#s=<token>`) persists in address bar
  - Auto-copies share URL to clipboard on session start
  - Live colored cursors with name labels
  - Conflict-free concurrent editing via Yjs
  - Presence indicator in status bar showing connected peers
- **Semantic Search Across All Documents** — in-browser ML
  - Natural language search via Transformers.js (all-MiniLM-L6-v2, ~23MB, cached)
  - Vector embeddings stored in IndexedDB for instant queries
  - Find Related Documents command for discovering connections
  - Auto-indexes current document on save when model is loaded
  - One-click index all files in linked folder
- **Plugin & Extension System** — ES module-based extensibility
  - Load trusted plugins from URLs (ES modules with `init(api)` pattern)
  - Sandboxed plugin execution in iframes with postMessage API bridge
  - Built-in plugins: Date Inserter, Lorem Ipsum, Word Frequency, Table of Contents
  - Plugin Manager UI for enabling/disabling/adding/removing plugins
  - Public plugin API: event bus, document access, command registration, slash commands, editor operations, namespaced storage

### Changed

- Major version bump to 2.0.0 for five new feature additions
- New npm dependencies: `docx`, `yjs`, `y-webrtc`, `y-prosemirror`, `@huggingface/transformers`

## [1.3.0] - 2026-02-22

### Added

- Drag & drop file open: drop `.md`, `.markdown`, or `.txt` files onto the editor to open them, with visual overlay and toast feedback
- Table size picker: visual 6×6 grid flyout in the More dropdown for choosing table dimensions before inserting
- History diff view: compare any history snapshot against the current document with colored line-level additions, removals, and collapsible unchanged context
- PWA support: web app manifest, service worker with offline caching, and installability (icon, theme-color, apple-touch-icon)

### Changed

- Browser tab title now derives from the first `# heading` in the document, updating live as you type
- "Save As" dialog suggests a filename based on the H1 heading for untitled documents
- History action button tooltips use native `title` attributes to avoid sidebar overflow clipping

### Removed

- Filename display and inline rename from the status bar (rename still available via sidebar context menu)

### Fixed

- Sanitize `javascript:`, `data:`, and `vbscript:` URLs in link creation to prevent XSS
- Whitelist settings keys when loading from localStorage to prevent prototype pollution
- Replace `innerHTML = ''` clearing with `replaceChildren()` across all UI modules
- Replace direct `innerHTML` SVG swap in theme toggle with safe `svgIcon()` helper

### Changed

- Rename `html` attribute to `unsafeHTML` in `el()` DOM helper to signal trusted-only usage
- Add `Content-Security-Policy` meta tag to `index.html` for defense-in-depth

## [1.2.0] - 2026-02-21

### Added

- Toolbar buttons (Bold, Italic, lists, headings, blockquote, HR, code block) now work in source mode
- Command palette formatting actions work in source mode
- Ctrl+B, Ctrl+I, Ctrl+E keyboard shortcuts work in source mode textarea
- Cursor position syncs when toggling between WYSIWYG and source view
- Print / PDF export via Ctrl+P, toolbar More dropdown, and command palette
- Table insertion via toolbar More dropdown and command palette (uses Milkdown Crepe built-in tables)
- Table insertion in source mode generates GFM table template
- Document outline sidebar panel with heading tree, click-to-scroll, and scroll spy highlighting
- Find & Replace (Ctrl+F / Ctrl+H) with match highlighting, counter, prev/next navigation, case-sensitive toggle, replace and replace all
- Find & Replace works in both WYSIWYG (ProseMirror decorations) and source mode (textarea selection)
- New keyboard shortcuts shown in About modal (Ctrl+F, Ctrl+H, Ctrl+P)

### Changed

- Local folder subfolders now start collapsed by default in sidebar file tree

## [1.1.0] - 2026-02-21

### Added

- Dark mode with toggle button in status bar (default: light)
- Focus/zen mode: cycle through Zen, Zen+Focus, Zen+Focus+Typewriter via status bar or Ctrl+Shift+F
- Enriched status bar: file name, word count, reading time, focus mode label
- Inline-editable filename in status bar (click to rename)
- Export: "Download .md" and "Copy as HTML" in toolbar More dropdown
- Export commands registered in command palette
- Command palette with fuzzy search (commands, headings) — Ctrl+K
- Paragraph focus and typewriter mode ProseMirror plugins
- Keyboard shortcuts: Ctrl+Shift+F (focus cycle), Ctrl+K (command palette)
- Document title syncs with current file name
- Auto-embed YouTube and X.com/Twitter URLs on paste (iframe for video, native tweet widget)
- About dialog with keyboard shortcuts, credits, issue link, and version
- Raw markdown source view toggle via Ctrl+U, command palette, and About modal

### Changed

- Tooltip colors use CSS variables instead of hardcoded values (dark mode compatible)
- Link underline color uses `var(--text-muted)` instead of hardcoded rgba
- Info button in status bar opens a modal instead of `alert()`
- Mobile toolbar scrolls horizontally instead of overflowing
- Mobile editor content uses full width at small breakpoints
- Default welcome content updated with actual feature list

### Fixed

- All modals (save picker, history preview, info) now close with Escape key

### Removed

- Unused `history-drawer.js` (not imported anywhere)
- Unused `indexeddb.js` (legacy Drive offline cache)
- Unused `markdown-utils.js` (status bar has its own stats)

## [1.0.0] - 2026-02-21

### Added

- WYSIWYG markdown editor powered by Milkdown Crepe
- Local folder sync via File System Access API (open, save, rename, delete)
- Save picker with local file, linked folder, and browser-only options
- Version history with periodic snapshots, manual checkpoints, preview, and restore
- History section in sidebar, toggled via status bar button or Ctrl+Shift+H
- Keyboard shortcuts (Ctrl+S, Ctrl+Shift+S, Ctrl+N, Ctrl+O, Ctrl+L, Ctrl+Shift+B, Ctrl+Shift+H)
- Formatting toolbar (bold, italic, strikethrough, code, headings, lists, links, images, blockquotes)
- Word count in status bar
- Session persistence across page reloads
- GitHub Pages deployment via GitHub Actions

### Removed

- Google Drive sign-in and sync integration
- Right-side history drawer (consolidated into left sidebar)
