# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

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
