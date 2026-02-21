import { el } from '../utils/dom.js';
import { icons } from '../toolbar/toolbar-icons.js';
import { createFileItem } from './file-item.js';

/**
 * Builds a nested tree from a flat file list.
 * Input:  [{ name, path, handle, modifiedTime }, ...]
 * Output: { dirs: { name: { dirs, files } }, files: [...] }
 */
export function buildTree(flatFiles) {
  const root = { dirs: {}, files: [] };

  for (const file of flatFiles) {
    const parts = file.path.split('/');
    let node = root;

    // Walk/create directory nodes for all but the last segment
    for (let i = 0; i < parts.length - 1; i++) {
      const dirName = parts[i];
      if (!node.dirs[dirName]) {
        node.dirs[dirName] = { dirs: {}, files: [] };
      }
      node = node.dirs[dirName];
    }

    node.files.push(file);
  }

  return root;
}

/**
 * Renders the tree into DOM nodes.
 *
 * @param {object} tree - from buildTree()
 * @param {object} opts
 * @param {string|null} opts.activeId - current file path
 * @param {string|null} opts.activeSource - 'local' | null
 * @param {function} opts.onOpen - (file) => void
 * @param {function} opts.onRename - (file) => void
 * @param {function} opts.onDelete - (file) => void
 * @param {boolean} opts.expanded - whether this level starts expanded (root=true, rest=false)
 * @param {number} opts.depth - nesting depth (0 = root level)
 * @param {Set|null} opts.expandedPaths - set of dir paths to force expand (for search)
 */
export function renderTree(tree, opts) {
  const {
    activeId = null,
    activeSource = null,
    onOpen,
    onRename,
    onDelete,
    expanded = true,
    depth = 0,
    expandedPaths = null,
  } = opts;

  const container = el('div', { className: 'file-tree' });

  // Files first, sorted alphabetically
  const sortedFiles = [...tree.files].sort((a, b) => a.name.localeCompare(b.name));

  for (const file of sortedFiles) {
    const indent = depth * 16;
    const item = createFileItem(file, {
      isActive: file.path === activeId && activeSource === 'local',
      onOpen: () => onOpen(file),
      onRename: () => onRename(file),
      onDelete: () => onDelete(file),
    });
    item.style.paddingLeft = `${12 + indent}px`;
    container.appendChild(item);
  }

  // Then subdirectories, sorted alphabetically
  const dirNames = Object.keys(tree.dirs).sort((a, b) => a.localeCompare(b));

  for (const dirName of dirNames) {
    const subTree = tree.dirs[dirName];
    const dirPath = getDirPath(tree, dirName, depth, opts);

    // Root level (depth 0) folders are expanded, everything deeper is collapsed.
    // When searching, expandedPaths forces ancestor folders open.
    const shouldExpand = depth === 0
      ? true
      : (expandedPaths ? expandedPaths.has(dirPath) : false);

    const folderEl = renderFolder(dirName, subTree, {
      ...opts,
      expanded: shouldExpand,
      depth: depth + 1,
    });

    container.appendChild(folderEl);
  }

  return container;
}

function renderFolder(name, subTree, opts) {
  const { expanded, depth } = opts;
  const indent = (depth - 1) * 16;

  const childrenEl = renderTree(subTree, opts);

  const folderRow = el('div', {
    className: 'tree-folder-row',
    style: { paddingLeft: `${12 + indent}px` },
    onClick: () => {
      wrapper.classList.toggle('collapsed');
    },
  },
    el('span', { className: 'tree-folder-chevron', html: icons.chevronDown }),
    el('span', { className: 'tree-folder-icon', html: icons.folder }),
    el('span', { className: 'tree-folder-name', title: name }, name),
  );

  const wrapper = el('div', {
    className: `tree-folder${expanded ? '' : ' collapsed'}`,
  },
    folderRow,
    el('div', { className: 'tree-folder-children' }, childrenEl),
  );

  return wrapper;
}

/**
 * Given a search query and flat file list, returns a Set of directory
 * paths that should be expanded to reveal matching files.
 */
export function getExpandedPathsForSearch(flatFiles, query) {
  const paths = new Set();
  const q = query.toLowerCase();

  for (const file of flatFiles) {
    if (file.name.toLowerCase().includes(q) || file.path.toLowerCase().includes(q)) {
      // Add all ancestor directory paths
      const parts = file.path.split('/');
      for (let i = 1; i < parts.length; i++) {
        paths.add(parts.slice(0, i).join('/'));
      }
    }
  }

  return paths;
}

/**
 * Filters the tree to only include files matching the query,
 * keeping directories that contain matches.
 */
export function filterTree(tree, query) {
  const q = query.toLowerCase();
  const filtered = { dirs: {}, files: [] };

  filtered.files = tree.files.filter(
    f => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q),
  );

  for (const [dirName, subTree] of Object.entries(tree.dirs)) {
    const subFiltered = filterTree(subTree, query);
    if (subFiltered.files.length > 0 || Object.keys(subFiltered.dirs).length > 0) {
      filtered.dirs[dirName] = subFiltered;
    }
  }

  return filtered;
}

// Helper to build a dir path for expandedPaths tracking
function getDirPath(tree, dirName, depth, opts) {
  // We don't have full path info on the tree node, so we reconstruct
  // from the file paths inside. This is a best-effort approach.
  const subTree = tree.dirs[dirName];
  const firstFile = findFirstFile(subTree);
  if (firstFile) {
    const parts = firstFile.path.split('/');
    // The dir we want is up to (depth+1) segments from the start
    return parts.slice(0, depth + 1).join('/');
  }
  return dirName;
}

function findFirstFile(tree) {
  if (tree.files.length > 0) return tree.files[0];
  for (const sub of Object.values(tree.dirs)) {
    const f = findFirstFile(sub);
    if (f) return f;
  }
  return null;
}
