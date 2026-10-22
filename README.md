# mkdn

A minimal, browser-based markdown editor. No accounts, no cloud — just write.

**[Try it live](https://nkarasiak.github.io/mkdn/)**

## Features

- **WYSIWYG editing** powered by [Milkdown](https://milkdown.dev/) (ProseMirror-based)
- **gedit-style UI** — header bar, tabs, status bar; no formatting toolbars
- **Real files** via the File System Access API — open, edit, and save files directly on disk, with autosave and "changed on disk" detection
- **Version history** with periodic snapshots and restore
- **Keyboard shortcuts** — Ctrl+O open, Ctrl+S save, Ctrl+T new tab, Ctrl+U raw markdown
- **Offline-first** — everything runs in the browser, no server needed

## Getting Started

```bash
npm install
npm run dev
```

Opens on [localhost:3000](http://localhost:3000).

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build |

## Tech Stack

- [Vite](https://vite.dev/) — build tool
- [Milkdown Crepe](https://milkdown.dev/) — WYSIWYG markdown editor
- Vanilla JS — no framework, imperative DOM with a custom `el()` helper
- IndexedDB — offline file cache and history snapshots
- localStorage — user preferences

## License

MIT
