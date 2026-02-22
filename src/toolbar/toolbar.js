import { el } from '../utils/dom.js';
import { icons } from './toolbar-icons.js';
import { milkdown } from '../editor/milkdown-setup.js';
import { documentStore } from '../store/document-store.js';
import { eventBus } from '../store/event-bus.js';
import { openLinkPopover } from '../ui/link-popover.js';
import { downloadMarkdown, copyHtml, printDocument } from '../utils/export.js';

function btn(icon, tooltip, onClick, extraClass = '') {
  return el('button', {
    className: `toolbar-btn ${extraClass}`.trim(),
    'data-tooltip': tooltip,
    unsafeHTML: icons[icon],
    onMousedown: (e) => e.preventDefault(), // keep editor focus
    onClick,
  });
}

function divider() {
  return el('div', { className: 'toolbar-divider' });
}

function group(...children) {
  return el('div', { className: 'toolbar-group' }, ...children);
}

function createDropdown(label, items) {
  const menu = el('div', { className: 'toolbar-dropdown-menu' });
  items.forEach(({ label: itemLabel, onClick }) => {
    menu.appendChild(el('button', {
      className: 'toolbar-dropdown-item',
      onClick: () => { onClick(); closeAllDropdowns(); },
    }, itemLabel));
  });

  const trigger = el('button', {
    className: 'toolbar-dropdown-btn',
    onClick: (e) => {
      e.stopPropagation();
      const wasOpen = menu.classList.contains('open');
      closeAllDropdowns();
      if (!wasOpen) menu.classList.add('open');
    },
  },
    el('span', {}, label),
    el('span', { className: 'toolbar-chevron', unsafeHTML: icons.chevronDown }),
  );

  const wrapper = el('div', { className: 'toolbar-dropdown' }, trigger, menu);
  return wrapper;
}

function closeAllDropdowns() {
  document.querySelectorAll('.toolbar-dropdown-menu.open').forEach(m => m.classList.remove('open'));
}

// Close dropdowns on outside click
document.addEventListener('click', closeAllDropdowns);

export function createToolbar({ onToggleSidebar, onSave, onOpen, onOpenFolder }) {
  // === HEADER ROW ===

  // Back / sidebar button
  const backBtn = el('button', {
    className: 'toolbar-nav-btn',
    'data-tooltip': 'Files (Ctrl+Shift+B)',
    unsafeHTML: icons.arrowLeft,
    onClick: onToggleSidebar,
  });

  // Save status badge
  const statusDot = el('span', { className: 'toolbar-status-dot' });
  const statusText = el('span', { className: 'toolbar-status-text' }, 'saved');
  const statusBadge = el('div', { className: 'toolbar-status-badge' }, statusDot, statusText);

  // Open file button
  const openBtn = el('button', {
    className: 'toolbar-secondary-btn',
    'data-tooltip': 'Open file (Ctrl+O)',
    onClick: onOpen,
  },
    el('span', { className: 'toolbar-btn-icon', unsafeHTML: icons.file }),
    'Open',
  );

  // Open folder button
  const openFolderBtn = el('button', {
    className: 'toolbar-secondary-btn',
    'data-tooltip': 'Open folder',
    onClick: onOpenFolder,
  },
    el('span', { className: 'toolbar-btn-icon', unsafeHTML: icons.folderOpen }),
    'Folder',
  );

  const headerRow = el('div', { className: 'toolbar-header' },
    el('div', { className: 'toolbar-header-left' }, backBtn, statusBadge),
    el('div', { className: 'toolbar-header-right' }, openBtn, openFolderBtn),
  );

  // === FORMATTING TOOLBAR ROW ===

  // Undo / Redo
  const undoBtn = btn('undo', 'Undo (Ctrl+Z)', () =>
    milkdown.runCommand(milkdown.commands.undo));
  const redoBtn = btn('redo', 'Redo (Ctrl+Shift+Z)', () =>
    milkdown.runCommand(milkdown.commands.redo));

  // Style dropdown
  const styleDropdown = createDropdown('Style', [
    { label: 'Normal', onClick: () => milkdown.runCommand(milkdown.commands.wrapHeading, 0) },
    { label: 'Heading 1', onClick: () => milkdown.runCommand(milkdown.commands.wrapHeading, 1) },
    { label: 'Heading 2', onClick: () => milkdown.runCommand(milkdown.commands.wrapHeading, 2) },
    { label: 'Heading 3', onClick: () => milkdown.runCommand(milkdown.commands.wrapHeading, 3) },
  ]);

  // Format buttons
  const boldBtn = btn('bold', 'Bold (Ctrl+B)', () =>
    milkdown.runCommand(milkdown.commands.toggleBold));
  const italicBtn = btn('italic', 'Italic (Ctrl+I)', () =>
    milkdown.runCommand(milkdown.commands.toggleItalic));
  const strikeBtn = btn('strikethrough', 'Strikethrough', () =>
    milkdown.runCommand(milkdown.commands.toggleStrikethrough));
  const codeBtn = btn('code', 'Code (Ctrl+E)', () =>
    milkdown.runCommand(milkdown.commands.toggleCode));

  // Insert buttons
  const linkBtn = btn('link', 'Link (Ctrl+L)', () => openLinkPopover(linkBtn));
  const imageInput = el('input', {
    type: 'file',
    accept: 'image/*',
    style: 'display:none',
  });
  imageInput.addEventListener('change', () => {
    const file = imageInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      milkdown.runCommand(milkdown.commands.insertImage, {
        src: reader.result,
        alt: file.name,
      });
    };
    reader.readAsDataURL(file);
    imageInput.value = '';
  });
  const imageBtn = btn('image', 'Image', () => imageInput.click());
  const videoBtn = btn('video', 'Video embed', () => {
    const url = window.prompt('Video URL (YouTube or X.com):');
    if (url) milkdown.insertEmbedUrl(url);
  });
  const commentBtn = btn('comment', 'Blockquote', () => milkdown.toggleBlockquote());

  // List buttons (toggle: click again to unwrap back to paragraph)
  const ulBtn = btn('ul', 'Bullet List', () =>
    milkdown.toggleList('bullet_list', milkdown.commands.wrapBulletList));
  const olBtn = btn('ol', 'Numbered List', () =>
    milkdown.toggleList('ordered_list', milkdown.commands.wrapOrderedList));

  // More dropdown
  const moreDropdown = createDropdown('More', [
    { label: 'Table', onClick: () => milkdown.insertTable() },
    { label: 'Horizontal rule', onClick: () =>
      milkdown.runCommand(milkdown.commands.insertHr) },
    { label: 'Code block', onClick: () => {
      milkdown.runCommand(milkdown.commands.wrapHeading, 0);
      milkdown.runCommand(milkdown.commands.createCodeBlock);
    }},
    { label: 'Download .md', onClick: () => downloadMarkdown() },
    { label: 'Copy as HTML', onClick: () => copyHtml() },
    { label: 'Print / PDF', onClick: () => printDocument() },
  ]);

  const formattingRow = el('div', { className: 'toolbar-formatting' },
    group(undoBtn, redoBtn),
    divider(),
    styleDropdown,
    divider(),
    group(boldBtn, italicBtn, strikeBtn, codeBtn),
    divider(),
    group(linkBtn, imageBtn, videoBtn, commentBtn),
    divider(),
    group(ulBtn, olBtn),
    divider(),
    moreDropdown,
  );

  // Prevent toolbar buttons from stealing focus from the editor
  formattingRow.addEventListener('mousedown', (e) => {
    e.preventDefault();
  });

  // === COMBINED TOOLBAR ===
  const toolbar = el('div', { className: 'toolbar' }, headerRow, formattingRow);

  // Listen for save status
  const setSaved = () => {
    statusDot.className = 'toolbar-status-dot saved';
    statusText.textContent = 'saved';
  };
  const setUnsaved = () => {
    statusDot.className = 'toolbar-status-dot';
    statusText.textContent = 'editing';
  };

  eventBus.on('file:saved', setSaved);
  eventBus.on('sync:saved', setSaved);
  // Ignore content changes during initial Milkdown sync (first 2s)
  let initialized = false;
  setTimeout(() => { initialized = true; }, 2000);
  eventBus.on('content:changed', () => {
    if (initialized && documentStore.isDirty()) setUnsaved();
  });
  eventBus.on('file:opened', setSaved);
  eventBus.on('file:new', setSaved);

  // Start as saved
  setSaved();

  return toolbar;
}
