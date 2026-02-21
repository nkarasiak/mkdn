# mkdn

A minimal, browser-based markdown editor. No accounts, no cloud — just write.

**[Try it live](https://nkarasiak.github.io/mkdn/)**

## Features

- **WYSIWYG editing** powered by [Milkdown](https://milkdown.dev/) (ProseMirror-based)
- **Local folder sync** via the File System Access API — open, edit, and save files directly on disk
- **Version history** with periodic snapshots, manual checkpoints, and restore
- **Keyboard shortcuts** — Ctrl+S save, Ctrl+N new, Ctrl+O open, and more
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
