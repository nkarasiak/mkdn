import { el } from '../utils/dom.js';
import { documentStore } from '../store/document-store.js';
import { tabStore } from '../store/tab-store.js';
import { localFs, TEXT_EXTENSIONS } from '../local/local-fs.js';
import { confirm as confirmModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { downloadMarkdown } from '../utils/export.js';

const AUTOSAVE_INTERVAL = 30000;
const EXTERNAL_CHECK_INTERVAL = 5000;

// fileId → FileSystemFileHandle (browser) or path (Tauri). One per open document,
// so saving tab A can never write into tab B's file.
// ponytail: browser handles are not persisted, so after a reload Save falls back to Save As.
const handles = new Map();
let externalCheckInFlight = false;

function suggestFileName() {
  const current = documentStore.getFileName();
  if (current && current !== 'Untitled.md') return current;
  const h1 = documentStore.getMarkdown().match(/^#\s+(.+)$/m)?.[1];
  const sanitized = h1?.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim();
  return sanitized ? `${sanitized}.md` : 'Untitled.md';
}

async function write(handle) {
  await localFs.writeFile(handle, documentStore.getMarkdown());
  const { modifiedTime } = await localFs.readFile(handle);
  documentStore.setLastModifiedOnDisk(modifiedTime);
  documentStore.markSaved();
}

async function autoSave() {
  const handle = handles.get(documentStore.getFileId());
  if (!handle || !documentStore.isDirty()) return;
  try {
    await write(handle);
  } catch (err) {
    console.warn('Auto-save failed:', err.message);
  }
}

async function checkForExternalChanges() {
  const fileId = documentStore.getFileId();
  const handle = handles.get(fileId);
  const baseline = documentStore.getLastModifiedOnDisk();
  if (externalCheckInFlight || !handle || baseline == null) return;

  externalCheckInFlight = true;
  try {
    const { content, modifiedTime } = await localFs.readFile(handle);
    if (modifiedTime <= baseline) return;
    const name = documentStore.getFileName();

    let reload = !documentStore.isDirty();
    if (!reload) {
      reload = await confirmModal(
        `"${name}" changed on disk. Load from disk and discard your unsaved edits?`,
        { title: 'File changed on disk', okText: 'Load from disk', cancelText: 'Keep mine' },
      ).catch(() => false);
    }
    if (reload) {
      documentStore.setFile(fileId, name, content, 'local', modifiedTime);
    } else {
      documentStore.setLastModifiedOnDisk(modifiedTime);
    }
  } catch {
    // File deleted/moved or permission revoked — keep the in-memory copy
  } finally {
    externalCheckInFlight = false;
  }
}

export const fileSaver = {
  init() {
    setInterval(autoSave, AUTOSAVE_INTERVAL);
    setInterval(() => { if (!document.hidden) checkForExternalChanges(); }, EXTERNAL_CHECK_INTERVAL);
    window.addEventListener('focus', checkForExternalChanges);
  },

  /** Open a file handle (browser) or absolute path (Tauri) into a tab. */
  async openHandle(handle) {
    const { name, content, modifiedTime } = await localFs.readFile(handle);
    const id = typeof handle === 'string' ? handle : handle.path || name;
    handles.set(id, handle);
    documentStore.setFile(id, name, content, 'local', modifiedTime);
  },

  async openFile() {
    if (!localFs.isSupported()) {
      // No File System Access API (Firefox, Safari): read-only open, Save downloads.
      const input = el('input', { type: 'file', accept: TEXT_EXTENSIONS.map(e => `.${e}`).join(',') });
      input.addEventListener('change', async () => {
        const file = input.files[0];
        if (file) documentStore.setFile(file.name, file.name, await file.text(), 'local');
      });
      input.click();
      return;
    }
    let handle;
    try {
      handle = await localFs.pickFile();
    } catch {
      return; // cancelled
    }
    try {
      await this.openHandle(handle);
    } catch (err) {
      toast(`Failed to open: ${err.message}`, 'error');
    }
  },

  async save() {
    const handle = handles.get(documentStore.getFileId());
    if (!handle) return this.saveAs();
    try {
      await write(handle);
    } catch (err) {
      toast(`Save failed: ${err.message}`, 'error');
    }
  },

  async saveAs() {
    if (!localFs.isSupported()) {
      downloadMarkdown();
      documentStore.markSaved();
      return;
    }
    let handle;
    try {
      handle = await localFs.pickSaveFile(suggestFileName());
    } catch {
      return; // cancelled
    }
    const previousTabId = tabStore.getActiveTabId();
    try {
      await localFs.writeFile(handle, documentStore.getMarkdown());
      await this.openHandle(handle);
      documentStore.markSaved();
      // The saved file opened in its own tab; drop the tab it was saved from.
      if (previousTabId !== tabStore.getActiveTabId()) tabStore.closeTab(previousTabId);
    } catch (err) {
      toast(`Save failed: ${err.message}`, 'error');
    }
  },
};
