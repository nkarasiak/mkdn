import { el, injectStyles } from '../utils/dom.js';
import { libraryDB } from './library-db.js';
import { documentStore } from '../store/document-store.js';
import { eventBus } from '../store/event-bus.js';
import { toast } from '../ui/toast.js';

let overlay = null;

export async function openLibrary() {
  if (overlay) { closeLibrary(); return; }

  const docs = await libraryDB.getAll();
  const folders = await libraryDB.getFolders();

  let currentFolder = '';
  let searchQuery = '';
  let viewMode = localStorage.getItem('mkdn-library-view') || 'list';

  const searchInput = el('input', {
    className: 'library-search',
    type: 'text',
    placeholder: 'Search documents...',
  });

  const listContainer = el('div', { className: 'library-list' });

  const newBtn = el('button', { className: 'library-new-btn', onClick: () => {
    closeLibrary();
    documentStore.newDocument();
  }}, '+ New Document');

  const importBtn = el('button', { className: 'library-action-btn', onClick: async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.md,.markdown,.txt';
    input.multiple = true;
    input.addEventListener('change', async () => {
      for (const file of input.files) {
        const text = await file.text();
        if (file.name.endsWith('.json')) {
          const count = await libraryDB.importAll(text);
          toast(`Imported ${count} documents`, 'success');
        } else {
          await libraryDB.save({ title: file.name.replace(/\.\w+$/, ''), content: text });
          toast(`Imported ${file.name}`, 'success');
        }
      }
      renderList();
    });
    input.click();
  }}, 'Import');

  const exportBtn = el('button', { className: 'library-action-btn', onClick: async () => {
    const json = await libraryDB.exportAll();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mkdn-library.json';
    a.click();
    URL.revokeObjectURL(url);
    toast('Library exported', 'success');
  }}, 'Export');

  const viewToggle = el('button', {
    className: 'library-action-btn',
    onClick: () => {
      viewMode = viewMode === 'list' ? 'grid' : 'list';
      localStorage.setItem('mkdn-library-view', viewMode);
      renderList();
    },
  }, viewMode === 'list' ? 'Grid' : 'List');

  const folderFilter = el('select', { className: 'library-folder-filter' },
    el('option', { value: '' }, 'All Documents'),
    ...folders.map(f => el('option', { value: f }, f)),
  );
  folderFilter.addEventListener('change', () => {
    currentFolder = folderFilter.value;
    renderList();
  });

  async function renderList() {
    let filtered = searchQuery
      ? await libraryDB.search(searchQuery)
      : await libraryDB.getAll();

    if (currentFolder) {
      filtered = filtered.filter(d => d.folder === currentFolder);
    }

    listContainer.replaceChildren();
    viewToggle.textContent = viewMode === 'list' ? 'Grid' : 'List';
    listContainer.className = `library-list library-${viewMode}`;

    if (filtered.length === 0) {
      listContainer.appendChild(
        el('div', { className: 'library-empty' },
          el('div', { className: 'library-empty-icon' }, '\u{1F4DD}'),
          el('div', { className: 'library-empty-text' }, 'No documents yet'),
          el('div', { className: 'library-empty-hint' }, 'Create a new document or import existing files'),
        )
      );
      return;
    }

    filtered.forEach(doc => {
      const preview = doc.content.replace(/[#*_`~\[\]()>|\\-]/g, '').trim().slice(0, 120);
      const date = new Date(doc.modified).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: doc.modified < Date.now() - 180 * 86400000 ? 'numeric' : undefined,
      });

      const item = el('div', {
        className: 'library-item',
        onClick: () => {
          documentStore.setFile(doc.id, doc.title.endsWith('.md') ? doc.title : doc.title + '.md', doc.content, 'library');
          closeLibrary();
        },
      },
        el('div', { className: 'library-item-title' }, doc.title || 'Untitled'),
        el('div', { className: 'library-item-preview' }, preview || 'Empty document'),
        el('div', { className: 'library-item-meta' },
          el('span', {}, date),
          el('span', {}, `${doc.wordCount || 0} words`),
          doc.folder ? el('span', { className: 'library-item-folder' }, doc.folder) : null,
        ),
        el('button', {
          className: 'library-item-delete',
          onClick: async (e) => {
            e.stopPropagation();
            if (confirm(`Delete "${doc.title}"?`)) {
              await libraryDB.delete(doc.id);
              renderList();
              toast('Document deleted', 'info');
            }
          },
        }, '\u00D7'),
      );
      listContainer.appendChild(item);
    });
  }

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    renderList();
  });

  const panel = el('div', { className: 'library-panel' },
    el('div', { className: 'library-header' },
      el('h2', { className: 'library-title' }, 'Document Library'),
      el('button', { className: 'library-close-btn', onClick: closeLibrary }, '\u00D7'),
    ),
    el('div', { className: 'library-toolbar' },
      searchInput,
      folderFilter,
      el('div', { className: 'library-toolbar-actions' }, viewToggle, importBtn, exportBtn, newBtn),
    ),
    listContainer,
  );

  overlay = el('div', { className: 'library-overlay', onClick: (e) => {
    if (e.target === overlay) closeLibrary();
  }}, panel);

  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    overlay.classList.add('library-open');
    searchInput.focus();
  });

  renderList();
}

export function closeLibrary() {
  if (!overlay) return false;
  overlay.classList.remove('library-open');
  setTimeout(() => { overlay?.remove(); overlay = null; }, 200);
  return true;
}

// Auto-save current document to library on content changes (debounced)
let saveTimeout = null;

export function initLibraryAutoSave() {
  eventBus.on('content:changed', ({ source } = {}) => {
    if (source !== 'milkdown' && source !== 'source-editor') return;
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      const content = documentStore.getMarkdown();
      if (!content?.trim()) return;

      const fileName = documentStore.getFileName();
      const fileId = documentStore.getFileId();

      // Use existing fileId as library doc id, or create from filename
      const id = fileId || `lib_${fileName.replace(/[^a-z0-9]/gi, '_')}`;
      await libraryDB.save({
        id,
        title: fileName.replace(/\.md$/i, ''),
        content,
      });
    }, 5000);
  });

  // Save on file:saved
  eventBus.on('file:saved', async () => {
    const content = documentStore.getMarkdown();
    const fileName = documentStore.getFileName();
    const fileId = documentStore.getFileId();
    const id = fileId || `lib_${fileName.replace(/[^a-z0-9]/gi, '_')}`;
    await libraryDB.save({
      id,
      title: fileName.replace(/\.md$/i, ''),
      content,
    });
  });
}

// Styles
injectStyles(`
  .library-overlay {
    position: fixed;
    inset: 0;
    background: var(--bg-overlay);
    z-index: 500;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .library-overlay.library-open {
    opacity: 1;
  }

  .library-panel {
    width: 90vw;
    max-width: 720px;
    max-height: 80vh;
    background: var(--bg-primary);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transform: translateY(8px);
    transition: transform 0.2s ease;
  }

  .library-open .library-panel {
    transform: translateY(0);
  }

  .library-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px 12px;
    border-bottom: 1px solid var(--border-light);
  }

  .library-title {
    font-family: var(--font-sans);
    font-size: var(--font-size-lg);
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
  }

  .library-close-btn {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    font-size: 18px;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    cursor: pointer;
    transition: background 0.1s ease;
  }

  .library-close-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .library-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    flex-wrap: wrap;
  }

  .library-search {
    flex: 1;
    min-width: 160px;
    padding: 7px 12px;
    font-family: var(--font-sans);
    font-size: var(--font-size-sm);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-primary);
    color: var(--text-primary);
    outline: none;
  }

  .library-search:focus {
    border-color: var(--accent);
  }

  .library-folder-filter {
    padding: 6px 10px;
    font-family: var(--font-sans);
    font-size: var(--font-size-sm);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  .library-toolbar-actions {
    display: flex;
    gap: 6px;
  }

  .library-action-btn {
    padding: 5px 12px;
    font-family: var(--font-sans);
    font-size: var(--font-size-xs);
    font-weight: 500;
    color: var(--text-secondary);
    background: var(--bg-tertiary);
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background 0.1s ease;
  }

  .library-action-btn:hover {
    background: var(--bg-active);
    color: var(--text-primary);
  }

  .library-new-btn {
    padding: 5px 14px;
    font-family: var(--font-sans);
    font-size: var(--font-size-xs);
    font-weight: 600;
    color: var(--accent-text);
    background: var(--accent);
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background 0.1s ease;
  }

  .library-new-btn:hover {
    background: var(--accent-hover);
  }

  .library-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px 20px 20px;
  }

  .library-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
  }

  .library-item {
    position: relative;
    padding: 12px 14px;
    border: 1px solid var(--border-light);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: background 0.1s ease, border-color 0.1s ease;
  }

  .library-list:not(.library-grid) .library-item {
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .library-list:not(.library-grid) .library-item-preview {
    flex: 1;
    min-width: 0;
  }

  .library-item:hover {
    background: var(--bg-hover);
    border-color: var(--border-color);
  }

  .library-item-title {
    font-family: var(--font-sans);
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .library-item-preview {
    font-family: var(--font-sans);
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    margin-top: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .library-grid .library-item-preview {
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    min-height: 42px;
  }

  .library-item-meta {
    display: flex;
    gap: 10px;
    margin-top: 6px;
    font-family: var(--font-sans);
    font-size: 10px;
    color: var(--text-muted);
  }

  .library-item-folder {
    padding: 1px 6px;
    background: var(--bg-tertiary);
    border-radius: 3px;
  }

  .library-item-delete {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 22px;
    height: 22px;
    border-radius: var(--radius-sm);
    font-size: 14px;
    color: var(--text-muted);
    background: none;
    border: none;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.1s ease, background 0.1s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .library-item:hover .library-item-delete {
    opacity: 1;
  }

  .library-item-delete:hover {
    background: var(--error);
    color: white;
  }

  .library-empty {
    text-align: center;
    padding: 40px 20px;
    color: var(--text-muted);
    font-family: var(--font-sans);
  }

  .library-empty-icon {
    font-size: 40px;
    margin-bottom: 12px;
  }

  .library-empty-text {
    font-size: var(--font-size-lg);
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 4px;
  }

  .library-empty-hint {
    font-size: var(--font-size-sm);
  }
`);
