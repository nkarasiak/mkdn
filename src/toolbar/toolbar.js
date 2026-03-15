import { el } from '../utils/dom.js';
import { icons } from './toolbar-icons.js';
import { milkdown } from '../editor/milkdown-setup.js';
import { documentStore } from '../store/document-store.js';
import { eventBus } from '../store/event-bus.js';
import { openLinkPopover } from '../ui/link-popover.js';
import { downloadMarkdown, copyHtml, printDocument } from '../utils/export.js';
import { createTablePicker } from './table-picker.js';
import { openCollabDialog } from '../collab/collab-ui.js';
import { settingsStore } from '../store/settings-store.js';
import { localSync } from '../local/local-sync.js';
import { saveImageToAssets, saveImageToAssetsTauri, isTauri } from '../editor/image-paste-plugin.js';

function btn(icon, tooltip, onClick, extraClass = '') {
  return el('button', {
    className: `toolbar-btn ${extraClass}`.trim(),
    'data-tooltip': tooltip,
    'aria-label': tooltip,
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
    'aria-label': 'Files (Ctrl+Shift+B)',
    unsafeHTML: settingsStore.get('sidebarOpen') ? icons.arrowLeft : icons.arrowRight,
    onClick: onToggleSidebar,
  });

  // Flip arrow when sidebar state changes
  eventBus.on('settings:sidebarOpen', (open) => {
    backBtn.innerHTML = open ? icons.arrowLeft : icons.arrowRight;
  });

  // Save status badge (clickable — triggers save when unsaved)
  const statusDot = el('span', { className: 'toolbar-status-dot' });
  const statusText = el('span', { className: 'toolbar-status-text' }, 'saved');
  const statusBadge = el('button', {
    className: 'toolbar-status-badge',
    'data-tooltip': 'Save (Ctrl+S)',
    onClick: onSave,
  }, statusDot, statusText);

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

  // Share / Collab button
  const shareBtn = el('button', {
    className: 'toolbar-secondary-btn',
    'data-tooltip': 'Collaborate',
    onClick: () => openCollabDialog(),
  },
    el('span', { className: 'toolbar-btn-icon', unsafeHTML: icons.share }),
    'Share',
  );

  // Update share button label when collab is active
  eventBus.on('collab:started', () => {
    shareBtn.querySelector('span:last-child')?.remove();
    shareBtn.appendChild(document.createTextNode('Live'));
    shareBtn.classList.add('toolbar-btn-active');
  });
  eventBus.on('collab:stopped', () => {
    shareBtn.classList.remove('toolbar-btn-active');
    while (shareBtn.childNodes.length > 1) shareBtn.lastChild.remove();
    shareBtn.appendChild(document.createTextNode('Share'));
  });

  // === BREADCRUMB ===
  const breadcrumbEl = el('div', { className: 'toolbar-breadcrumb' });

  function updateBreadcrumb() {
    breadcrumbEl.replaceChildren();
    const folderName = localSync.isLinked() ? localSync.getFolderName() : null;
    const fileId = documentStore.getFileId();
    const fileName = documentStore.getFileName();

    if (folderName) {
      const folderSpan = el('span', {
        className: 'breadcrumb-segment breadcrumb-folder',
        onClick: onToggleSidebar,
      }, folderName);
      breadcrumbEl.appendChild(folderSpan);

      // If fileId has path segments, show subdirectories
      if (fileId && fileId.includes('/')) {
        const parts = fileId.split('/');
        // Show intermediate path segments (skip last = filename)
        for (let i = 0; i < parts.length - 1; i++) {
          breadcrumbEl.appendChild(el('span', { className: 'breadcrumb-sep' }));
          breadcrumbEl.appendChild(
            el('span', { className: 'breadcrumb-segment' }, parts[i]),
          );
        }
      }

      breadcrumbEl.appendChild(el('span', { className: 'breadcrumb-sep' }));
    }

    const nameSpan = el('span', {
      className: 'breadcrumb-segment breadcrumb-file',
      onClick: () => {
        // Inline rename
        const input = el('input', {
          type: 'text',
          className: 'breadcrumb-rename-input',
          value: fileName.replace(/\.md$/i, ''),
        });
        nameSpan.replaceWith(input);
        input.focus();
        input.select();
        const finish = () => {
          const newName = input.value.trim();
          if (newName && newName !== fileName.replace(/\.md$/i, '')) {
            const fullName = newName.endsWith('.md') ? newName : newName + '.md';
            documentStore.setFileName(fullName);
          }
          input.replaceWith(nameSpan);
        };
        input.addEventListener('blur', finish);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
          if (e.key === 'Escape') { input.value = fileName.replace(/\.md$/i, ''); input.blur(); }
        });
      },
    }, fileName.replace(/\.md$/i, ''));
    breadcrumbEl.appendChild(nameSpan);
  }

  updateBreadcrumb();
  eventBus.on('file:opened', updateBreadcrumb);
  eventBus.on('file:new', updateBreadcrumb);
  eventBus.on('file:renamed', updateBreadcrumb);
  eventBus.on('local:folder-linked', updateBreadcrumb);
  eventBus.on('local:folder-unlinked', updateBreadcrumb);

  const headerRow = el('div', { className: 'toolbar-header' },
    el('div', { className: 'toolbar-header-left' }, backBtn, breadcrumbEl, statusBadge),
    el('div', { className: 'toolbar-header-right' }, shareBtn, openBtn, openFolderBtn),
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
  imageInput.addEventListener('change', async () => {
    const file = imageInput.files[0];
    if (!file) return;

    // Try saving to local assets/ folder when linked
    if (localSync.isLinked()) {
      const dirHandle = localSync.getDirHandle();
      let relativePath = null;

      if (isTauri()) {
        relativePath = await saveImageToAssetsTauri(file, dirHandle);
      } else {
        relativePath = await saveImageToAssets(file);
      }

      if (relativePath) {
        milkdown.runCommand(milkdown.commands.insertImage, {
          src: relativePath,
          alt: file.name,
        });
        imageInput.value = '';
        return;
      }
    }

    // Fallback: embed as base64 data URI
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
  // Video popover (reuses link-popover CSS classes)
  let videoPopover = null;
  function closeVideoPopover() {
    if (videoPopover) {
      videoPopover.classList.remove('link-popover-open');
      setTimeout(() => videoPopover?.remove(), 150);
      videoPopover = null;
      document.removeEventListener('click', onVideoOutsideClick);
    }
  }
  function onVideoOutsideClick(e) {
    if (videoPopover && !videoPopover.contains(e.target)) closeVideoPopover();
  }
  const videoBtn = btn('video', 'Video embed', () => {
    if (videoPopover) { closeVideoPopover(); return; }
    const input = el('input', {
      className: 'link-popover-input',
      type: 'text',
      placeholder: 'https://youtube.com/watch?v=...',
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const url = input.value.trim();
        if (url) milkdown.insertEmbedUrl(url);
        closeVideoPopover();
      }
      if (e.key === 'Escape') closeVideoPopover();
    });
    videoPopover = el('div', { className: 'link-popover' },
      el('div', { className: 'link-popover-header' }, 'Video URL'),
      input,
      el('div', { className: 'link-popover-footer' },
        el('button', { className: 'link-popover-btn', onClick: closeVideoPopover }, 'Cancel'),
        el('button', { className: 'link-popover-btn link-popover-btn-primary', onClick: () => {
          const url = input.value.trim();
          if (url) milkdown.insertEmbedUrl(url);
          closeVideoPopover();
        }}, 'Insert'),
      ),
    );
    // Position below the video button
    const rect = videoBtn.getBoundingClientRect();
    videoPopover.style.position = 'fixed';
    videoPopover.style.top = `${rect.bottom + 6}px`;
    videoPopover.style.left = `${rect.left + rect.width / 2}px`;
    document.body.appendChild(videoPopover);
    requestAnimationFrame(() => {
      videoPopover.classList.add('link-popover-open');
      input.focus();
    });
    setTimeout(() => document.addEventListener('click', onVideoOutsideClick), 0);
  });
  const commentBtn = btn('comment', 'Blockquote', () => milkdown.toggleBlockquote());

  // List buttons (toggle: click again to unwrap back to paragraph)
  const ulBtn = btn('ul', 'Bullet List', () =>
    milkdown.toggleList('bullet_list', milkdown.commands.wrapBulletList));
  const olBtn = btn('ol', 'Numbered List', () =>
    milkdown.toggleList('ordered_list', milkdown.commands.wrapOrderedList));

  // More dropdown with grouped sections
  const moreMenu = el('div', { className: 'toolbar-dropdown-menu toolbar-dropdown-grouped' });

  function menuGroupHeader(label) {
    return el('div', { className: 'toolbar-menu-group-header' }, label);
  }

  function menuItem(icon, label, onClick) {
    return el('button', {
      className: 'toolbar-dropdown-item toolbar-dropdown-item-icon',
      onClick: () => { onClick(); closeAllDropdowns(); },
    },
      el('span', { className: 'toolbar-menu-icon', textContent: icon }),
      el('span', {}, label),
    );
  }

  // --- Insert group ---
  moreMenu.appendChild(menuGroupHeader('Insert'));

  // Table item with picker flyout
  const tablePicker = createTablePicker((rows, cols) => {
    milkdown.insertTable(rows, cols);
    closeAllDropdowns();
  });
  const tableItem = el('div', { className: 'toolbar-dropdown-item toolbar-dropdown-item-icon table-picker-item' });
  tableItem.appendChild(el('span', { className: 'toolbar-menu-icon', textContent: '\u{1F4CA}' }));
  tableItem.appendChild(el('span', {}, 'Table'));
  tableItem.appendChild(el('span', { className: 'toolbar-chevron', unsafeHTML: icons.chevronRight }));
  const tableFlyout = el('div', { className: 'table-picker-flyout' }, tablePicker);
  tableItem.appendChild(tableFlyout);
  moreMenu.appendChild(tableItem);

  // Callout submenu
  const calloutTypes = ['NOTE', 'TIP', 'WARNING', 'CAUTION', 'IMPORTANT'];
  const calloutIcons = { NOTE: '\u2139\uFE0F', TIP: '\u{1F4A1}', WARNING: '\u26A0\uFE0F', CAUTION: '\u{1F6D1}', IMPORTANT: '\u2757' };
  const calloutItem = el('div', { className: 'toolbar-dropdown-item toolbar-dropdown-item-icon table-picker-item' });
  calloutItem.appendChild(el('span', { className: 'toolbar-menu-icon', textContent: '\u{1F4A1}' }));
  calloutItem.appendChild(el('span', {}, 'Callout'));
  calloutItem.appendChild(el('span', { className: 'toolbar-chevron', unsafeHTML: icons.chevronRight }));
  const calloutFlyout = el('div', { className: 'table-picker-flyout callout-flyout' });
  calloutTypes.forEach(type => {
    calloutFlyout.appendChild(el('button', {
      className: 'toolbar-dropdown-item toolbar-dropdown-item-icon',
      onClick: () => {
        if (settingsStore.get('sourceMode')) {
          import('../editor/source-formatter.js').then(m => m.sourceFormat.callout(type));
        } else {
          milkdown.toggleBlockquote();
          // Insert the callout marker text
          const view = milkdown.getView();
          if (view) {
            const { state, dispatch } = view;
            const { from } = state.selection;
            dispatch(state.tr.insertText(`[!${type}]\n`, from, from).scrollIntoView());
          }
        }
        closeAllDropdowns();
      },
    },
      el('span', { className: 'toolbar-menu-icon', textContent: calloutIcons[type] }),
      el('span', {}, type.charAt(0) + type.slice(1).toLowerCase()),
    ));
  });
  calloutItem.appendChild(calloutFlyout);
  moreMenu.appendChild(calloutItem);

  moreMenu.appendChild(menuItem('\u25B6', 'Toggle Block', () => {
    if (settingsStore.get('sourceMode')) {
      import('../editor/source-formatter.js').then(m => m.sourceFormat.toggleBlock());
    } else {
      const view = milkdown.getView();
      if (view) {
        const { state, dispatch } = view;
        const text = '<details>\n<summary>Click to expand</summary>\n\nContent here\n\n</details>';
        dispatch(state.tr.insertText(text).scrollIntoView());
      }
    }
  }));
  moreMenu.appendChild(menuItem('\u2500', 'Horizontal Rule', () =>
    milkdown.runCommand(milkdown.commands.insertHr)));
  moreMenu.appendChild(menuItem('\u2328\uFE0F', 'Code Block', () => {
    milkdown.runCommand(milkdown.commands.wrapHeading, 0);
    milkdown.runCommand(milkdown.commands.createCodeBlock);
  }));

  // --- Export group ---
  moreMenu.appendChild(menuGroupHeader('Export'));

  moreMenu.appendChild(menuItem('\u2B07\uFE0F', 'Download .md', () => downloadMarkdown()));
  moreMenu.appendChild(menuItem('\u{1F4CB}', 'Copy as HTML', () => copyHtml()));
  moreMenu.appendChild(menuItem('\u{1F5A8}\uFE0F', 'Print / PDF', () => printDocument()));
  moreMenu.appendChild(menuItem('\u{1F310}', 'Export as HTML', () =>
    import('../export/html-export.js').then(m => m.exportStyledHtml())));
  moreMenu.appendChild(menuItem('\u{1F4C4}', 'Export as DOCX', () =>
    import('../export/docx-export.js').then(m => m.exportDocx())));
  moreMenu.appendChild(menuItem('\u{1F4FD}\uFE0F', 'Present as Slides', () =>
    import('../export/slides.js').then(m => m.enterSlideMode())));

  // --- Tools group ---
  moreMenu.appendChild(menuGroupHeader('Tools'));

  moreMenu.appendChild(menuItem('\u{1F50D}', 'Semantic Search', () =>
    import('../search/semantic-search-ui.js').then(m => m.openSearchPanel())));
  moreMenu.appendChild(menuItem('\u{1F578}\uFE0F', 'Knowledge Graph', () =>
    import('../graph/graph-view.js').then(m => m.openGraphView())));
  moreMenu.appendChild(menuItem('\u{1F4E4}', 'Publish to GitHub', () =>
    import('../export/github-publish.js').then(m => m.openGithubPublish())));
  moreMenu.appendChild(menuItem('\u{1F9E9}', 'Plugins', () =>
    import('../plugins/plugin-manager-ui.js').then(m => m.openPluginManager())));

  const moreTrigger = el('button', {
    className: 'toolbar-dropdown-btn',
    onClick: (e) => {
      e.stopPropagation();
      const wasOpen = moreMenu.classList.contains('open');
      closeAllDropdowns();
      if (!wasOpen) moreMenu.classList.add('open');
    },
  },
    el('span', {}, 'More'),
    el('span', { className: 'toolbar-chevron', unsafeHTML: icons.chevronDown }),
  );

  const moreDropdown = el('div', { className: 'toolbar-dropdown' }, moreTrigger, moreMenu);

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

  // === ACTIVE FORMATTING STATE ===
  const styleLabel = styleDropdown.querySelector('.toolbar-dropdown-btn > span:first-child');

  function updateActiveFormatting() {
    if (settingsStore.get('sourceMode')) return;
    const view = milkdown.getView?.();
    if (!view) return;
    const { state } = view;
    const { $from } = state.selection;
    const marks = state.storedMarks || $from.marks();

    // Marks
    const hasBold = marks.some(m => m.type.name === 'strong');
    const hasItalic = marks.some(m => m.type.name === 'emphasis');
    const hasStrike = marks.some(m => m.type.name === 'strikethrough');
    const hasCode = marks.some(m => m.type.name === 'inlineCode');

    boldBtn.classList.toggle('toolbar-btn-active-format', hasBold);
    italicBtn.classList.toggle('toolbar-btn-active-format', hasItalic);
    strikeBtn.classList.toggle('toolbar-btn-active-format', hasStrike);
    codeBtn.classList.toggle('toolbar-btn-active-format', hasCode);

    // Node type (heading / list / blockquote)
    const parent = $from.parent;
    const grandparent = $from.node($from.depth - 1);

    let styleText = 'Style';
    if (parent.type.name === 'heading') {
      styleText = `Heading ${parent.attrs.level}`;
    } else if (parent.type.name === 'paragraph') {
      styleText = 'Normal';
    }
    if (styleLabel) styleLabel.textContent = styleText;

    const isBullet = grandparent?.type.name === 'list_item' &&
      $from.node($from.depth - 2)?.type.name === 'bullet_list';
    const isOrdered = grandparent?.type.name === 'list_item' &&
      $from.node($from.depth - 2)?.type.name === 'ordered_list';
    const isBlockquote = state.selection.$from.path?.some?.((v, i) =>
      typeof v === 'object' && v?.type?.name === 'blockquote'
    ) || false;

    ulBtn.classList.toggle('toolbar-btn-active-format', !!isBullet);
    olBtn.classList.toggle('toolbar-btn-active-format', !!isOrdered);
    commentBtn.classList.toggle('toolbar-btn-active-format', !!isBlockquote);
  }

  // Poll on selection changes via ProseMirror transaction
  eventBus.on('content:changed', updateActiveFormatting);
  // Also update on click/arrow keys
  document.addEventListener('selectionchange', () => {
    requestAnimationFrame(updateActiveFormatting);
  });
  // Update after milkdown init with a small delay
  setTimeout(updateActiveFormatting, 2500);

  // === COMBINED TOOLBAR ===
  const toolbar = el('div', { className: 'toolbar' }, headerRow, formattingRow);

  // Listen for save status
  const setSaved = () => {
    statusDot.className = 'toolbar-status-dot saved';
    statusText.textContent = 'saved';
    statusBadge.classList.remove('unsaved');
    statusBadge.style.pointerEvents = 'none';
  };
  const setUnsaved = () => {
    statusDot.className = 'toolbar-status-dot';
    statusText.textContent = 'Save';
    statusBadge.classList.add('unsaved');
    statusBadge.style.pointerEvents = '';
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
