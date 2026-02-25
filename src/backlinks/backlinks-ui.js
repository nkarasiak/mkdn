import { el, injectStyles } from '../utils/dom.js';
import { icons } from '../toolbar/toolbar-icons.js';
import { documentStore } from '../store/document-store.js';
import { eventBus } from '../store/event-bus.js';
import { localSync } from '../local/local-sync.js';
import { getBacklinksBody } from '../sidebar/sidebar.js';
import { extractWikiLinks, findBacklinks, getOutgoingLinks, resolveWikiLink } from './backlinks-engine.js';
import { debounce } from '../utils/debounce.js';

let lastFiles = [];
let backlinksPanelEl = null;

function renderBacklinksPanel(backlinks, outgoing, files) {
  const container = getBacklinksBody();
  if (!container) return;
  container.replaceChildren();

  // Outgoing links section
  if (outgoing.length > 0) {
    const outEl = el('div', { className: 'backlinks-section' },
      el('div', { className: 'backlinks-subtitle' }, `Outgoing (${outgoing.length})`),
    );
    for (const link of outgoing) {
      const resolved = resolveWikiLink(link.target, files);
      const item = el('div', {
        className: `backlinks-item${resolved ? '' : ' unresolved'}`,
        onClick: () => {
          if (resolved) localSync.open(resolved.path);
        },
      },
        el('span', { className: 'backlinks-icon', unsafeHTML: icons.file || `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>` }),
        el('span', { className: 'backlinks-name' }, link.display),
      );
      outEl.appendChild(item);
    }
    container.appendChild(outEl);
  }

  // Incoming backlinks section
  if (backlinks.length > 0) {
    const inEl = el('div', { className: 'backlinks-section' },
      el('div', { className: 'backlinks-subtitle' }, `Incoming (${backlinks.length})`),
    );
    for (const bl of backlinks) {
      const item = el('div', {
        className: 'backlinks-item',
        onClick: () => localSync.open(bl.path),
      },
        el('span', { className: 'backlinks-icon', unsafeHTML: icons.arrowLeft || `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>` }),
        el('span', { className: 'backlinks-name' }, bl.fileName.replace(/\.md$/i, '')),
      );
      inEl.appendChild(item);
    }
    container.appendChild(inEl);
  }

  // Empty state
  if (outgoing.length === 0 && backlinks.length === 0) {
    container.appendChild(
      el('div', { className: 'sidebar-empty' },
        'No wiki-links found. Use [[page-name]] to link between notes.',
      ),
    );
  }
}

const refreshBacklinks = debounce(async () => {
  const fileName = documentStore.getFileName();
  const outgoing = getOutgoingLinks();

  if (!localSync.isLinked() || !lastFiles.length) {
    renderBacklinksPanel([], outgoing, []);
    return;
  }

  try {
    const backlinks = await findBacklinks(fileName, lastFiles);
    renderBacklinksPanel(backlinks, outgoing, lastFiles);
  } catch {
    renderBacklinksPanel([], outgoing, lastFiles);
  }
}, 1000);

export function initBacklinks() {
  // Update on content changes
  eventBus.on('content:changed', refreshBacklinks);
  eventBus.on('file:opened', refreshBacklinks);
  eventBus.on('file:new', refreshBacklinks);

  // Track file list
  eventBus.on('local:files-updated', ({ files }) => {
    lastFiles = files;
    refreshBacklinks();
  });
  eventBus.on('local:folder-linked', refreshBacklinks);
  eventBus.on('local:folder-unlinked', () => {
    lastFiles = [];
    refreshBacklinks();
  });

  // Initial render
  refreshBacklinks();
}

// Inject backlinks CSS
injectStyles(`
  .backlinks-section {
    padding: 4px 0;
  }
  .backlinks-subtitle {
    font-size: var(--font-size-xs);
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 4px 12px;
  }
  .backlinks-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    cursor: pointer;
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    transition: background var(--transition-fast);
  }
  .backlinks-item:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
  .backlinks-item.unresolved {
    color: var(--text-muted);
    font-style: italic;
  }
  .backlinks-item.unresolved:hover {
    color: var(--text-muted);
    cursor: default;
  }
  .backlinks-icon {
    flex-shrink: 0;
    width: 14px;
    height: 14px;
    opacity: 0.6;
  }
  .backlinks-icon svg {
    width: 14px;
    height: 14px;
  }
  .backlinks-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`);
