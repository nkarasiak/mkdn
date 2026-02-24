import { el } from '../utils/dom.js';
import { embeddingEngine } from './embedding-engine.js';
import { vectorDB } from './vector-db.js';
import { documentStore } from '../store/document-store.js';
import { eventBus } from '../store/event-bus.js';
import { localSync } from '../local/local-sync.js';
import { toast } from '../ui/toast.js';

let searchPanel = null;
let indexingInProgress = false;

async function indexAllDocuments(statusEl) {
  if (indexingInProgress) {
    toast('Indexing already in progress', 'info');
    return;
  }

  indexingInProgress = true;

  try {
    // Make sure model is loaded
    if (!embeddingEngine.isReady()) {
      if (statusEl) statusEl.textContent = 'Loading AI model (~23MB, first time only)...';
      await embeddingEngine.init((progress) => {
        if (statusEl && progress.status === 'progress') {
          const pct = Math.round((progress.loaded / progress.total) * 100);
          statusEl.textContent = `Loading model: ${pct}%`;
        }
      });
    }

    // Get all files from local sync
    // We need to trigger a refresh and wait for the event
    if (!localSync.isLinked()) {
      if (statusEl) statusEl.textContent = 'No folder linked. Link a folder first.';
      indexingInProgress = false;
      return;
    }

    await localSync.refreshFileList();

    // Wait briefly for the file list event
    await new Promise(r => setTimeout(r, 300));

    // Read files and generate embeddings
    // We'll use the local-fs module to read files
    const { localFs } = await import('../local/local-fs.js');
    const dirHandle = localSync._getDirHandle ? localSync._getDirHandle() : null;

    // Get file list from localSync (through the event)
    let files = [];
    const filePromise = new Promise(resolve => {
      const unsub = eventBus.on('local:files-updated', ({ files: f }) => {
        files = f;
        unsub();
        resolve();
      });
      localSync.refreshFileList();
    });

    // Wait with timeout
    await Promise.race([filePromise, new Promise(r => setTimeout(r, 3000))]);

    if (files.length === 0) {
      if (statusEl) statusEl.textContent = 'No markdown files found in linked folder.';
      indexingInProgress = false;
      return;
    }

    let indexed = 0;
    for (const file of files) {
      try {
        if (statusEl) statusEl.textContent = `Indexing ${indexed + 1}/${files.length}: ${file.name}`;

        // Read file content
        let content = '';
        if (file.handle) {
          const f = await file.handle.getFile();
          content = await f.text();
        }

        if (!content || content.length < 20) continue;

        // Generate embedding
        const embedding = await embeddingEngine.embed(content);

        // Store in vector DB
        await vectorDB.store(
          file.path || file.name,
          file.path || file.name,
          file.name,
          content,
          embedding,
        );

        indexed++;
      } catch (e) {
        console.warn(`Failed to index ${file.name}:`, e);
      }
    }

    // Also index the current document
    const currentMd = documentStore.getMarkdown();
    const currentName = documentStore.getFileName();
    const currentId = documentStore.getFileId() || '_current';
    if (currentMd && currentMd.length > 20) {
      const embedding = await embeddingEngine.embed(currentMd);
      await vectorDB.store(currentId, currentId, currentName, currentMd, embedding);
    }

    if (statusEl) statusEl.textContent = `Indexed ${indexed} documents. Ready to search!`;
    toast(`Indexed ${indexed} documents`, 'success');
  } catch (e) {
    if (statusEl) statusEl.textContent = `Error: ${e.message}`;
    toast(`Indexing failed: ${e.message}`, 'error');
  } finally {
    indexingInProgress = false;
  }
}

async function performSearch(query, resultsContainer, statusEl) {
  if (!query.trim()) {
    resultsContainer.innerHTML = '';
    return;
  }

  if (!embeddingEngine.isReady()) {
    statusEl.textContent = 'Loading model...';
    try {
      await embeddingEngine.init();
    } catch (e) {
      statusEl.textContent = `Model load failed: ${e.message}`;
      return;
    }
  }

  statusEl.textContent = 'Searching...';

  try {
    // Embed the query
    const queryEmbedding = await embeddingEngine.embed(query);

    // Get all stored embeddings
    const allDocs = await vectorDB.getAll();

    if (allDocs.length === 0) {
      statusEl.textContent = 'No indexed documents. Click "Index Documents" first.';
      return;
    }

    // Calculate similarity scores
    const results = allDocs.map(doc => ({
      ...doc,
      score: embeddingEngine.cosineSimilarity(queryEmbedding, doc.embedding),
    }))
    .filter(r => r.score > 0.2) // Minimum relevance threshold
    .sort((a, b) => b.score - a.score)
    .slice(0, 10); // Top 10 results

    statusEl.textContent = `${results.length} results found`;

    // Render results
    resultsContainer.innerHTML = '';

    if (results.length === 0) {
      resultsContainer.appendChild(el('div', {
        style: { padding: '16px', color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center' },
      }, 'No matching documents found. Try different keywords.'));
      return;
    }

    for (const result of results) {
      const scorePercent = Math.round(result.score * 100);
      const item = el('div', { className: 'search-result-item' },
        el('div', { className: 'search-result-header' },
          el('span', { className: 'search-result-name' }, result.name),
          el('span', { className: 'search-result-score' }, `${scorePercent}%`),
        ),
        el('div', { className: 'search-result-preview' }, result.preview),
      );

      item.addEventListener('click', () => {
        // Open the file
        if (result.path && result.path !== '_current') {
          localSync.open(result.path);
          closeSearchPanel();
        }
      });

      resultsContainer.appendChild(item);
    }
  } catch (e) {
    statusEl.textContent = `Search error: ${e.message}`;
  }
}

export function openSearchPanel() {
  if (searchPanel) {
    searchPanel.style.display = 'flex';
    const input = searchPanel.querySelector('.search-panel-input');
    if (input) input.focus();
    return;
  }

  const input = el('input', {
    type: 'text',
    className: 'search-panel-input',
    placeholder: 'Search by meaning... (e.g. "notes about database design")',
  });

  const statusEl = el('div', { className: 'search-panel-status' });
  const resultsContainer = el('div', { className: 'search-results' });

  let searchTimer = null;
  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      performSearch(input.value, resultsContainer, statusEl);
    }, 500);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSearchPanel();
    if (e.key === 'Enter') {
      clearTimeout(searchTimer);
      performSearch(input.value, resultsContainer, statusEl);
    }
  });

  const indexBtn = el('button', {
    className: 'search-index-btn',
    onClick: () => indexAllDocuments(statusEl),
  }, 'Index Documents');

  const clearBtn = el('button', {
    className: 'search-clear-btn',
    onClick: async () => {
      await vectorDB.clear();
      toast('Vector index cleared', 'info');
      statusEl.textContent = 'Index cleared.';
    },
  }, 'Clear Index');

  searchPanel = el('div', { className: 'search-panel' },
    el('div', { className: 'search-panel-header' },
      el('span', {}, 'Semantic Search'),
      el('button', {
        className: 'search-panel-close',
        onClick: closeSearchPanel,
      }, '\u00D7'),
    ),
    input,
    el('div', { className: 'search-panel-actions' }, indexBtn, clearBtn),
    statusEl,
    resultsContainer,
  );

  document.body.appendChild(searchPanel);
  input.focus();

  // Show indexed count
  vectorDB.count().then(count => {
    if (count > 0) {
      statusEl.textContent = `${count} documents indexed. Type to search.`;
    } else {
      statusEl.textContent = 'No documents indexed yet. Click "Index Documents" to start.';
    }
  });
}

export function closeSearchPanel() {
  if (searchPanel) {
    searchPanel.style.display = 'none';
  }
}

export function isSearchPanelOpen() {
  return searchPanel && searchPanel.style.display !== 'none';
}

export async function findRelatedDocuments() {
  const currentMd = documentStore.getMarkdown();
  if (!currentMd || currentMd.length < 30) {
    toast('Document too short to find related notes', 'warning');
    return;
  }

  if (!embeddingEngine.isReady()) {
    const dismiss = toast('Loading search model...', 'info', 30000);
    try {
      await embeddingEngine.init();
      dismiss();
    } catch (e) {
      dismiss();
      toast(`Failed to load model: ${e.message}`, 'error');
      return;
    }
  }

  const allDocs = await vectorDB.getAll();
  if (allDocs.length < 2) {
    toast('Need more indexed documents. Index your folder first.', 'info');
    return;
  }

  const queryEmbedding = await embeddingEngine.embed(currentMd);
  const currentId = documentStore.getFileId() || '_current';

  const results = allDocs
    .filter(d => d.id !== currentId)
    .map(doc => ({
      name: doc.name,
      path: doc.path,
      score: embeddingEngine.cosineSimilarity(queryEmbedding, doc.embedding),
    }))
    .filter(r => r.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (results.length === 0) {
    toast('No related documents found', 'info');
    return;
  }

  // Open search panel with results shown
  openSearchPanel();
  const resultsContainer = searchPanel.querySelector('.search-results');
  const statusEl = searchPanel.querySelector('.search-panel-status');

  if (resultsContainer && statusEl) {
    statusEl.textContent = `${results.length} related documents:`;
    resultsContainer.innerHTML = '';

    for (const result of results) {
      const scorePercent = Math.round(result.score * 100);
      const item = el('div', { className: 'search-result-item' },
        el('div', { className: 'search-result-header' },
          el('span', { className: 'search-result-name' }, result.name),
          el('span', { className: 'search-result-score' }, `${scorePercent}%`),
        ),
      );
      item.addEventListener('click', () => {
        localSync.open(result.path);
        closeSearchPanel();
      });
      resultsContainer.appendChild(item);
    }
  }
}

// Auto-index current document on save
export function initAutoIndex() {
  eventBus.on('file:saved', async () => {
    if (!embeddingEngine.isReady()) return; // Only if model already loaded

    const currentMd = documentStore.getMarkdown();
    const currentName = documentStore.getFileName();
    const currentId = documentStore.getFileId() || '_current';

    if (currentMd && currentMd.length > 20) {
      try {
        const embedding = await embeddingEngine.embed(currentMd);
        await vectorDB.store(currentId, currentId, currentName, currentMd, embedding);
      } catch { /* silently fail - not critical */ }
    }
  });
}
