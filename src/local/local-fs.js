export const localFs = {
  isSupported() {
    return typeof window.showDirectoryPicker === 'function';
  },

  pickDirectory() {
    return window.showDirectoryPicker({ mode: 'readwrite' });
  },

  pickFile() {
    return window.showOpenFilePicker({
      types: [{
        description: 'Markdown files',
        accept: { 'text/markdown': ['.md', '.markdown'] },
      }],
      multiple: false,
    }).then(handles => handles[0]);
  },

  pickSaveFile(suggestedName = 'Untitled.md') {
    return window.showSaveFilePicker({
      suggestedName,
      types: [{
        description: 'Markdown files',
        accept: { 'text/markdown': ['.md', '.markdown'] },
      }],
    });
  },

  async requestPermission(handle) {
    const perm = await handle.requestPermission({ mode: 'readwrite' });
    return perm === 'granted';
  },

  async listMarkdownFiles(dirHandle) {
    const files = [];
    await walk(dirHandle, '', files);
    files.sort((a, b) => b.modifiedTime - a.modifiedTime);
    return files;
  },

  async readFile(fileHandle) {
    const file = await fileHandle.getFile();
    const content = await file.text();
    return { name: file.name, content, modifiedTime: file.lastModified };
  },

  async writeFile(fileHandle, content) {
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  },

  async createFile(dirHandle, name, content) {
    const fileHandle = await dirHandle.getFileHandle(name, { create: true });
    await this.writeFile(fileHandle, content);
    return fileHandle;
  },

  async deleteFile(dirHandle, path) {
    const parts = path.split('/');
    const fileName = parts.pop();
    let current = dirHandle;
    for (const part of parts) {
      current = await current.getDirectoryHandle(part);
    }
    await current.removeEntry(fileName);
  },

  async renameFile(dirHandle, oldPath, newName) {
    const parts = oldPath.split('/');
    const oldFileName = parts.pop();
    let parentDir = dirHandle;
    for (const part of parts) {
      parentDir = await parentDir.getDirectoryHandle(part);
    }

    const oldHandle = await parentDir.getFileHandle(oldFileName);
    const { content } = await this.readFile(oldHandle);
    await this.createFile(parentDir, newName, content);
    await parentDir.removeEntry(oldFileName);
  },

  async getFileHandle(dirHandle, path) {
    const parts = path.split('/');
    const fileName = parts.pop();
    let current = dirHandle;
    for (const part of parts) {
      current = await current.getDirectoryHandle(part);
    }
    return current.getFileHandle(fileName);
  },
};

async function walk(dirHandle, prefix, results) {
  for await (const entry of dirHandle.values()) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === 'directory') {
      await walk(entry, path, results);
    } else if (entry.kind === 'file' && entry.name.endsWith('.md')) {
      const file = await entry.getFile();
      results.push({
        name: entry.name,
        path,
        handle: entry,
        modifiedTime: file.lastModified,
      });
    }
  }
}
