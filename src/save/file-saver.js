import { el } from '../utils/dom.js';
import { icons } from '../toolbar/toolbar-icons.js';
import { documentStore } from '../store/document-store.js';
import { localSync } from '../local/local-sync.js';
import { localFs } from '../local/local-fs.js';
import { prompt as promptModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';

function showSaveLocationPicker() {
  return new Promise((resolve) => {
    const overlay = el('div', { className: 'modal-overlay' });

    let resolved = false;
    function pick(choice) {
      if (resolved) return;
      resolved = true;
      overlay.classList.remove('modal-open');
      if (overlay.parentNode) overlay.remove();
      resolve(choice);
    }

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) pick(null);
    });

    // Resolve as cancelled when closed externally (e.g. global Escape → closeModal)
    overlay.addEventListener('modal:close', () => pick(null));

    const options = [];

    // Local file option (File System Access API)
    if (localFs.isSupported()) {
      options.push(
        el('button', {
          className: 'save-picker-option',
          onClick: () => pick('local-file'),
        },
          el('span', { className: 'save-picker-icon', html: icons.download }),
          el('span', { className: 'save-picker-label' }, 'Save to local file'),
          el('span', { className: 'save-picker-desc' }, 'Pick a location on your computer'),
        ),
      );
    }

    // Linked folder option
    if (localSync.isLinked()) {
      const folderName = localSync.getFolderName();
      options.push(
        el('button', {
          className: 'save-picker-option',
          onClick: () => pick('local-folder'),
        },
          el('span', { className: 'save-picker-icon', html: icons.folder }),
          el('span', { className: 'save-picker-label' }, `Save to ${folderName}`),
          el('span', { className: 'save-picker-desc' }, 'Save in your linked local folder'),
        ),
      );
    }

    // Browser-only option
    options.push(
      el('button', {
        className: 'save-picker-option',
        onClick: () => pick('browser'),
      },
        el('span', { className: 'save-picker-icon', html: icons.clock }),
        el('span', { className: 'save-picker-label' }, 'Browser only'),
        el('span', { className: 'save-picker-desc' }, 'Keep in this browser session (no file created)'),
      ),
    );

    const modal = el('div', { className: 'modal save-picker-modal' },
      el('div', { className: 'modal-header' }, 'Save to...'),
      el('div', { className: 'modal-body save-picker-body' }, ...options),
    );

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('modal-open'));
  });
}

async function askFileName() {
  try {
    return await promptModal('File name:', {
      title: 'Save As',
      defaultValue: documentStore.getFileName(),
    });
  } catch {
    return null; // cancelled
  }
}

async function handleSaveChoice(choice) {
  if (choice === 'local-file') {
    return localSync.saveAsFile();
  }
  if (choice === 'local-folder') {
    const name = await askFileName();
    if (name) return localSync.saveAs(name);
  }
  if (choice === 'browser') {
    documentStore.markSaved();
    toast('Saved in browser', 'success');
  }
  // null = cancelled
}

export const fileSaver = {
  openFile() {
    if (localFs.isSupported()) {
      return localSync.openFile();
    }
    return Promise.resolve();
  },

  saveAsFile() {
    if (localFs.isSupported()) {
      return localSync.saveAsFile();
    }
    return Promise.resolve();
  },

  async save() {
    const source = documentStore.getFileSource();

    // File already has a source — save directly
    if (source === 'local') {
      return localSync.save();
    }

    // New unsaved document — ask where to save
    const choice = await showSaveLocationPicker();
    return handleSaveChoice(choice);
  },

  async saveAs() {
    const source = documentStore.getFileSource();

    // File already has a source — prompt for name and save to same source
    if (source === 'local') {
      const name = await askFileName();
      if (name) return localSync.saveAs(name);
      return;
    }

    // No source — show location picker, then prompt for name if needed
    const choice = await showSaveLocationPicker();
    return handleSaveChoice(choice);
  },
};

// Inject save picker styles
const style = document.createElement('style');
style.textContent = `
.save-picker-modal {
  max-width: 400px;
}
.save-picker-body {
  padding: 8px 12px 12px !important;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.save-picker-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  text-align: left;
  transition: background var(--transition-fast);
  cursor: pointer;
  width: 100%;
}
.save-picker-option:hover {
  background: var(--bg-hover);
}
.save-picker-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  flex-shrink: 0;
}
.save-picker-icon svg {
  width: 16px;
  height: 16px;
}
.save-picker-label {
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--text-primary);
  flex: 1;
}
.save-picker-desc {
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  white-space: nowrap;
}
@media (max-width: 480px) {
  .save-picker-desc {
    display: none;
  }
}
`;
document.head.appendChild(style);
