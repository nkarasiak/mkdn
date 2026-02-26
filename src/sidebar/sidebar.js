import { el } from '../utils/dom.js';
import { icons } from '../toolbar/toolbar-icons.js';
import { createFileItem } from './file-item.js';
import { buildTree, renderTree, filterTree, getExpandedPathsForSearch } from './file-tree.js';
import { localSync } from '../local/local-sync.js';
import { localFs } from '../local/local-fs.js';
import { documentStore } from '../store/document-store.js';
import { settingsStore } from '../store/settings-store.js';
import { eventBus } from '../store/event-bus.js';
import { confirm as confirmModal, prompt as promptModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { createHistoryPanel } from '../history/history-panel.js';
import { createOutlinePanel } from './outline-panel.js';
import { debounce } from '../utils/debounce.js';

let sidebarEl = null;
let searchInput = null;
let searchQuery = '';
let historySectionEl = null;
let outlineSectionEl = null;
let backlinksSectionEl = null;
let sectionsEl = null;

// Local state
let localFiles = [];
let localFileListEl = null;
let localSectionEl = null;
let localBodyEl = null;

// Section registry for reordering
const sectionRegistry = {};

function renderLocalFileList() {
  if (!localFileListEl) return;
  localFileListEl.replaceChildren();

  if (!localSync.isLinked()) {
    localFileListEl.appendChild(
      el('button', {
        className: 'local-link-btn',
        onClick: () => localSync.linkFolder(),
      },
        el('span', { unsafeHTML: icons.folder }),
        'Open Folder',
      ),
    );
    return;
  }

  let tree = buildTree(localFiles);
  let expandedPaths = null;

  if (searchQuery) {
    tree = filterTree(tree, searchQuery);
    expandedPaths = getExpandedPathsForSearch(localFiles, searchQuery);
  }

  // Check if the tree is empty
  if (tree.files.length === 0 && Object.keys(tree.dirs).length === 0) {
    localFileListEl.appendChild(
      el('div', { className: 'sidebar-empty' },
        searchQuery ? 'No matching files' : 'No markdown files in folder',
      ),
    );
    return;
  }

  const treeEl = renderTree(tree, {
    activeId: documentStore.getFileId(),
    activeSource: documentStore.getFileSource(),
    onOpen: (f) => localSync.open(f.path),
    onRename: async (f) => {
      try {
        const newName = await promptModal('Enter new name:', { title: 'Rename File', defaultValue: f.name });
        if (newName) await localSync.renameFile(f.path, newName);
      } catch { /* cancelled */ }
    },
    onDelete: async (f) => {
      try {
        const ok = await confirmModal(`Delete "${f.name}"? This cannot be undone.`, { title: 'Delete File', okText: 'Delete', danger: true });
        if (ok) await localSync.deleteFile(f.path);
      } catch { /* cancelled */ }
    },
    expanded: true,
    depth: 0,
    expandedPaths,
  });

  localFileListEl.appendChild(treeEl);
}

function renderLocalSectionHeader() {
  if (!localSectionEl || !localBodyEl) return;

  // Update folder name and action buttons in the header
  const actionsEl = localSectionEl.querySelector('.sidebar-section-actions');
  if (!actionsEl) return;
  actionsEl.replaceChildren();

  if (localSync.isLinked()) {
    actionsEl.appendChild(
      el('button', {
        className: 'toolbar-btn',
        'data-tooltip': 'Refresh',
        unsafeHTML: icons.refresh,
        onClick: (e) => { e.stopPropagation(); localSync.refreshFileList(); },
      }),
    );
    actionsEl.appendChild(
      el('button', {
        className: 'toolbar-btn',
        'data-tooltip': 'Unlink folder',
        unsafeHTML: icons.unlink,
        onClick: (e) => { e.stopPropagation(); localSync.unlinkFolder(); },
      }),
    );
  }

  // Update folder name
  const existingName = localBodyEl.querySelector('.local-folder-name');
  if (existingName) existingName.remove();

  if (localSync.isLinked()) {
    localBodyEl.insertBefore(
      el('div', { className: 'local-folder-name' }, localSync.getFolderName()),
      localFileListEl,
    );
  }
}

function createSection(title, bodyChildren, { collapsed = false, sectionKey = null } = {}) {
  const bodyEl = el('div', { className: 'sidebar-section-body' }, ...bodyChildren);
  const actionsEl = el('div', { className: 'sidebar-section-actions' });
  const sectionEl = el('div', { className: `sidebar-section${collapsed ? ' collapsed' : ''}` },
    el('div', {
      className: 'sidebar-section-header',
      onClick: () => sectionEl.classList.toggle('collapsed'),
    },
      el('span', { className: 'sidebar-section-chevron', unsafeHTML: icons.chevronDown }),
      el('span', { className: 'sidebar-section-title' }, title),
      actionsEl,
    ),
    bodyEl,
  );
  if (sectionKey) {
    sectionEl.dataset.sectionKey = sectionKey;
    sectionRegistry[sectionKey] = sectionEl;
  }
  return { sectionEl, bodyEl, actionsEl };
}

function applySectionVisibility() {
  const visible = settingsStore.get('sidebarSections') || {};
  for (const [key, sectionEl] of Object.entries(sectionRegistry)) {
    if (sectionEl) {
      sectionEl.style.display = visible[key] === false ? 'none' : '';
    }
  }
}

function applySectionOrder() {
  if (!sectionsEl) return;
  const order = settingsStore.get('sidebarOrder') || ['localFolder', 'outline', 'backlinks', 'history'];
  // Re-append sections in configured order
  for (const key of order) {
    const sectionEl = sectionRegistry[key];
    if (sectionEl && sectionEl.parentNode === sectionsEl) {
      sectionsEl.appendChild(sectionEl);
    }
  }
}

export function createSidebar() {
  const debouncedSearch = debounce(() => renderLocalFileList(), 150);
  searchInput = el('input', {
    type: 'text',
    placeholder: 'Search files...',
    onInput: (e) => {
      searchQuery = e.target.value;
      debouncedSearch();
    },
  });

  sectionsEl = el('div', { className: 'sidebar-sections' });

  // Local Folder section (only if browser supports File System Access API)
  if (localFs.isSupported()) {
    localFileListEl = el('div', { className: 'file-list' });
    const local = createSection('Local Folder', [localFileListEl], { sectionKey: 'localFolder' });
    localSectionEl = local.sectionEl;
    localBodyEl = local.bodyEl;
    sectionsEl.appendChild(localSectionEl);
    renderLocalFileList();
    renderLocalSectionHeader();
  }

  // Outline section
  const outlinePanel = createOutlinePanel();
  const outline = createSection('Outline', [outlinePanel], { collapsed: false, sectionKey: 'outline' });
  outlineSectionEl = outline.sectionEl;
  sectionsEl.appendChild(outlineSectionEl);

  // Backlinks section (placeholder — populated by backlinks module)
  const backlinksBody = el('div', { className: 'backlinks-list' });
  const backlinks = createSection('Backlinks', [backlinksBody], { collapsed: false, sectionKey: 'backlinks' });
  backlinksSectionEl = backlinks.sectionEl;
  sectionsEl.appendChild(backlinksSectionEl);

  // History section
  const historyPanel = createHistoryPanel();
  const history = createSection('History', [historyPanel], { collapsed: true, sectionKey: 'history' });
  historySectionEl = history.sectionEl;
  sectionsEl.appendChild(historySectionEl);

  // Sidebar config button
  const configBtn = el('button', {
    className: 'toolbar-btn',
    'data-tooltip': 'Configure sections',
    unsafeHTML: icons.settings || icons.cog || `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    onClick: () => openSidebarConfig(),
  });

  sidebarEl = el('div', { className: 'sidebar' },
    el('div', { className: 'sidebar-header' },
      el('span', { className: 'sidebar-title' }, 'Files'),
      el('div', { className: 'sidebar-actions' },
        el('button', {
          className: 'toolbar-btn',
          'data-tooltip': 'New File',
          unsafeHTML: icons.plus,
          onClick: () => {
            documentStore.newDocument();
            toast('New document created', 'info');
          },
        }),
        configBtn,
      ),
    ),
    el('div', { className: 'sidebar-search' }, searchInput),
    sectionsEl,
  );

  // Apply initial section visibility and order
  applySectionVisibility();
  applySectionOrder();

  // Listen for section setting changes
  eventBus.on('settings:sidebarSections', applySectionVisibility);
  eventBus.on('settings:sidebarOrder', applySectionOrder);

  // Local events
  eventBus.on('local:files-updated', ({ files }) => {
    localFiles = files;
    renderLocalFileList();
  });
  eventBus.on('local:folder-linked', () => {
    renderLocalFileList();
    renderLocalSectionHeader();
  });
  eventBus.on('local:folder-unlinked', () => {
    localFiles = [];
    renderLocalFileList();
    renderLocalSectionHeader();
  });

  // Re-render when file changes (to update active state)
  eventBus.on('file:opened', () => {
    renderLocalFileList();
  });
  eventBus.on('file:new', () => {
    renderLocalFileList();
  });

  return sidebarEl;
}

async function openSidebarConfig() {
  const { showInfo } = await import('../ui/modal.js');
  const sections = settingsStore.get('sidebarSections') || {};
  const sectionNames = {
    localFolder: 'Local Folder',
    outline: 'Outline',
    backlinks: 'Backlinks',
    history: 'History',
  };

  const checkboxes = {};
  const items = Object.entries(sectionNames).map(([key, label]) => {
    const cb = el('input', { type: 'checkbox' });
    cb.checked = sections[key] !== false;
    checkboxes[key] = cb;
    cb.addEventListener('change', () => {
      const current = { ...settingsStore.get('sidebarSections') };
      current[key] = cb.checked;
      settingsStore.set('sidebarSections', current);
    });
    return el('label', { className: 'sidebar-config-item' }, cb, ` ${label}`);
  });

  const content = el('div', { className: 'sidebar-config' },
    el('p', { style: { marginBottom: '12px', color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' } },
      'Choose which sections to show in the sidebar.',
    ),
    ...items,
  );

  // Add inline styles for the config checkboxes
  const style = document.createElement('style');
  style.textContent = `
    .sidebar-config-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 0;
      font-size: var(--font-size-sm);
      cursor: pointer;
    }
    .sidebar-config-item input[type="checkbox"] {
      width: 16px;
      height: 16px;
      accent-color: var(--accent);
    }
  `;
  content.prepend(style);

  showInfo('Sidebar Sections', content);
}

export function getBacklinksBody() {
  return backlinksSectionEl?.querySelector('.backlinks-list') || null;
}

export function toggleOutlineSection() {
  const sidebarOpen = settingsStore.get('sidebarOpen');
  const outlineCollapsed = outlineSectionEl?.classList.contains('collapsed');

  if (!sidebarOpen) {
    settingsStore.set('sidebarOpen', true);
    outlineSectionEl?.classList.remove('collapsed');
  } else if (outlineCollapsed) {
    outlineSectionEl?.classList.remove('collapsed');
  } else {
    settingsStore.set('sidebarOpen', false);
  }
}

export function toggleHistorySection() {
  const sidebarOpen = settingsStore.get('sidebarOpen');
  const historyCollapsed = historySectionEl?.classList.contains('collapsed');

  if (!sidebarOpen) {
    // Open sidebar and uncollapse history
    settingsStore.set('sidebarOpen', true);
    historySectionEl?.classList.remove('collapsed');
  } else if (historyCollapsed) {
    // Sidebar open but history collapsed — uncollapse it
    historySectionEl?.classList.remove('collapsed');
  } else {
    // Sidebar open and history visible — close sidebar
    settingsStore.set('sidebarOpen', false);
  }
}
