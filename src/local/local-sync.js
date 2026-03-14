import { localFs } from './local-fs.js';
import { handleStore } from '../storage/handle-store.js';
import { documentStore } from '../store/document-store.js';
import { settingsStore } from '../store/settings-store.js';
import { eventBus } from '../store/event-bus.js';
import { toast } from '../ui/toast.js';

let dirHandle = null;
let fileList = [];
let autoSaveTimer = null;
let standaloneFileHandle = null; // for files opened via picker (outside linked folder)

export const localSync = {
  init() {
    if (!localFs.isSupported()) return;
    this.restoreHandle();
    this.startAutoSave();
  },

  async restoreHandle() {
    try {
      const saved = await handleStore.loadHandle();
      if (!saved) return;

      const granted = await localFs.requestPermission(saved);
      if (granted) {
        dirHandle = saved;
        eventBus.emit('local:folder-linked', { name: dirHandle.name });
        await this.refreshFileList();
      } else {
        await handleStore.clearHandle();
      }
    } catch {
      // Permission denied or handle invalid — silently ignore
    }
  },

  async linkFolder() {
    try {
      dirHandle = await localFs.pickDirectory();
      await handleStore.saveHandle(dirHandle);
      eventBus.emit('local:folder-linked', { name: dirHandle.name });
      await this.refreshFileList();
    } catch {
      // User cancelled picker
    }
  },

  async unlinkFolder() {
    dirHandle = null;
    fileList = [];
    await handleStore.clearHandle();
    eventBus.emit('local:folder-unlinked', {});
    eventBus.emit('local:files-updated', { files: [] });
  },

  isLinked() {
    return dirHandle !== null;
  },

  getDirHandle() {
    return dirHandle;
  },

  getFolderName() {
    return dirHandle ? dirHandle.name : null;
  },

  async refreshFileList() {
    if (!dirHandle) return;
    try {
      fileList = await localFs.listMarkdownFiles(dirHandle);
      eventBus.emit('local:files-updated', { files: fileList });
    } catch (err) {
      toast(`Failed to read folder: ${err.message}`, 'error');
    }
  },

  async open(filePath) {
    if (!dirHandle) return;
    try {
      const fileHandle = await localFs.getFileHandle(dirHandle, filePath);
      const { name, content } = await localFs.readFile(fileHandle);
      documentStore.setFile(filePath, name, content, 'local');
    } catch (err) {
      toast(`Failed to open: ${err.message}`, 'error');
    }
  },

  async openFile() {
    try {
      const fileHandle = await localFs.pickFile();
      const { name, content } = await localFs.readFile(fileHandle);
      standaloneFileHandle = fileHandle;
      documentStore.setFile(name, name, content, 'local');
    } catch {
      // User cancelled picker
    }
  },

  async saveAsFile() {
    const content = documentStore.getMarkdown();
    const fileName = documentStore.getFileName();
    try {
      const fileHandle = await localFs.pickSaveFile(fileName);
      await localFs.writeFile(fileHandle, content);
      standaloneFileHandle = fileHandle;
      const file = await fileHandle.getFile();
      documentStore.setFile(file.name, file.name, content, 'local');
      documentStore.markSaved();
      eventBus.emit('sync:saved', { fileName: file.name });
      toast(`Saved as "${file.name}"`, 'success');
    } catch {
      // User cancelled picker
    }
  },

  getStandaloneHandle() {
    return standaloneFileHandle;
  },

  async save() {
    // If we have a standalone file handle (opened via picker), save directly to it
    if (standaloneFileHandle && documentStore.getFileSource() === 'local') {
      try {
        eventBus.emit('sync:saving', {});
        await localFs.writeFile(standaloneFileHandle, documentStore.getMarkdown());
        documentStore.markSaved();
        eventBus.emit('sync:saved', { fileName: documentStore.getFileName() });
        toast('Saved locally', 'success');
        return;
      } catch (err) {
        eventBus.emit('sync:error', { error: err.message });
        toast(`Save failed: ${err.message}`, 'error');
        return;
      }
    }

    if (!dirHandle) {
      toast('No local folder linked', 'warning');
      return;
    }

    const content = documentStore.getMarkdown();
    const fileId = documentStore.getFileId();

    if (!fileId) {
      const name = documentStore.getFileName();
      return this.saveAs(name);
    }

    try {
      eventBus.emit('sync:saving', {});
      const fileHandle = await localFs.getFileHandle(dirHandle, fileId);
      await localFs.writeFile(fileHandle, content);
      documentStore.markSaved();
      eventBus.emit('sync:saved', { fileName: documentStore.getFileName() });
      toast('Saved locally', 'success');
    } catch (err) {
      eventBus.emit('sync:error', { error: err.message });
      toast(`Save failed: ${err.message}`, 'error');
    }
  },

  async saveAs(name) {
    if (!dirHandle) {
      toast('No local folder linked', 'warning');
      return;
    }

    const content = documentStore.getMarkdown();

    try {
      eventBus.emit('sync:saving', {});
      await localFs.createFile(dirHandle, name, content);
      documentStore.setFile(name, name, content, 'local');
      documentStore.markSaved();
      await this.refreshFileList();
      eventBus.emit('sync:saved', { fileName: name });
      toast(`Saved as "${name}"`, 'success');
    } catch (err) {
      eventBus.emit('sync:error', { error: err.message });
      toast(`Save failed: ${err.message}`, 'error');
    }
  },

  async deleteFile(filePath) {
    if (!dirHandle) return;
    try {
      await localFs.deleteFile(dirHandle, filePath);
      await this.refreshFileList();
      toast('File deleted', 'success');
    } catch (err) {
      toast(`Delete failed: ${err.message}`, 'error');
    }
  },

  async renameFile(filePath, newName) {
    if (!dirHandle) return;
    try {
      await localFs.renameFile(dirHandle, filePath, newName);
      if (documentStore.getFileId() === filePath && documentStore.getFileSource() === 'local') {
        // Update current document to point to new path
        const parts = filePath.split('/');
        parts.pop();
        const newPath = parts.length ? `${parts.join('/')}/${newName}` : newName;
        documentStore.setFile(newPath, newName, documentStore.getMarkdown(), 'local');
      }
      await this.refreshFileList();
      toast('File renamed', 'success');
    } catch (err) {
      toast(`Rename failed: ${err.message}`, 'error');
    }
  },

  startAutoSave() {
    if (autoSaveTimer) clearInterval(autoSaveTimer);
    const interval = settingsStore.get('autoSaveInterval') || 30000;
    autoSaveTimer = setInterval(() => this.autoSave(), interval);
  },

  async autoSave() {
    if (documentStore.getFileSource() !== 'local') return;
    if (!documentStore.isDirty()) return;
    if (!documentStore.getFileId()) return;

    try {
      const content = documentStore.getMarkdown();

      // Standalone file handle (opened via picker)
      if (standaloneFileHandle) {
        await localFs.writeFile(standaloneFileHandle, content);
        documentStore.markSaved();
        return;
      }

      // File inside linked folder
      if (!dirHandle) return;
      const fileHandle = await localFs.getFileHandle(dirHandle, documentStore.getFileId());
      await localFs.writeFile(fileHandle, content);
      documentStore.markSaved();
    } catch (err) {
      console.warn('Local auto-save failed:', err.message);
    }
  },

  async readFileContent(filePath) {
    if (!dirHandle) return null;
    try {
      const fileHandle = await localFs.getFileHandle(dirHandle, filePath);
      const { content } = await localFs.readFile(fileHandle);
      return content;
    } catch {
      return null;
    }
  },

  getFiles() {
    return fileList;
  },

  destroy() {
    if (autoSaveTimer) {
      clearInterval(autoSaveTimer);
      autoSaveTimer = null;
    }
  },
};
