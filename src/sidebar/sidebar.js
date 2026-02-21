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

let sidebarEl = null;
let searchInput = null;
let searchQuery = '';
let historySectionEl = null;
let outlineSectionEl = null;

// Local state
let localFiles = [];
let localFileListEl = null;
let localSectionEl = null;
let localBodyEl = null;

function renderLocalFileList() {
  if (!localFileListEl) return;
  localFileListEl.innerHTML = '';

  if (!localSync.isLinked()) {
    localFileListEl.appendChild(
      el('button', {
        className: 'local-link-btn',
        onClick: () => localSync.linkFolder(),
      },
        el('span', { html: icons.folder }),
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
  actionsEl.innerHTML = '';

  if (localSync.isLinked()) {
    actionsEl.appendChild(
      el('button', {
        className: 'toolbar-btn',
        'data-tooltip': 'Refresh',
        html: icons.refresh,
        onClick: (e) => { e.stopPropagation(); localSync.refreshFileList(); },
      }),
    );
    actionsEl.appendChild(
      el('button', {
        className: 'toolbar-btn',
        'data-tooltip': 'Unlink folder',
        html: icons.unlink,
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

function createSection(title, bodyChildren, { collapsed = false } = {}) {
  const bodyEl = el('div', { className: 'sidebar-section-body' }, ...bodyChildren);
  const actionsEl = el('div', { className: 'sidebar-section-actions' });
  const sectionEl = el('div', { className: `sidebar-section${collapsed ? ' collapsed' : ''}` },
    el('div', {
      className: 'sidebar-section-header',
      onClick: () => sectionEl.classList.toggle('collapsed'),
    },
      el('span', { className: 'sidebar-section-chevron', html: icons.chevronDown }),
      el('span', { className: 'sidebar-section-title' }, title),
      actionsEl,
    ),
    bodyEl,
  );
  return { sectionEl, bodyEl, actionsEl };
}

export function createSidebar() {
  searchInput = el('input', {
    type: 'text',
    placeholder: 'Search files...',
    onInput: (e) => {
      searchQuery = e.target.value;
      renderLocalFileList();
    },
  });

  const sectionsEl = el('div', { className: 'sidebar-sections' });

  // Local Folder section (only if browser supports File System Access API)
  if (localFs.isSupported()) {
    localFileListEl = el('div', { className: 'file-list' });
    const local = createSection('Local Folder', [localFileListEl]);
    localSectionEl = local.sectionEl;
    localBodyEl = local.bodyEl;
    sectionsEl.appendChild(localSectionEl);
    renderLocalFileList();
    renderLocalSectionHeader();
  }

  // Outline section
  const outlinePanel = createOutlinePanel();
  const outline = createSection('Outline', [outlinePanel], { collapsed: false });
  outlineSectionEl = outline.sectionEl;
  sectionsEl.appendChild(outlineSectionEl);

  // History section
  const historyPanel = createHistoryPanel();
  const history = createSection('History', [historyPanel], { collapsed: true });
  historySectionEl = history.sectionEl;
  sectionsEl.appendChild(historySectionEl);

  sidebarEl = el('div', { className: 'sidebar' },
    el('div', { className: 'sidebar-header' },
      el('span', { className: 'sidebar-title' }, 'Files'),
      el('div', { className: 'sidebar-actions' },
        el('button', {
          className: 'toolbar-btn',
          'data-tooltip': 'New File',
          html: icons.plus,
          onClick: () => {
            documentStore.newDocument();
            toast('New document created', 'info');
          },
        }),
      ),
    ),
    el('div', { className: 'sidebar-search' }, searchInput),
    sectionsEl,
  );

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
