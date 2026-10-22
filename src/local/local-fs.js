const MARKDOWN_TYPES = [{
  description: 'Markdown files',
  accept: { 'text/markdown': ['.md', '.markdown'] },
}];

export const localFs = {
  isSupported() {
    return typeof window.showOpenFilePicker === 'function';
  },

  pickFile() {
    return window.showOpenFilePicker({ types: MARKDOWN_TYPES, multiple: false })
      .then(handles => handles[0]);
  },

  pickSaveFile(suggestedName = 'Untitled.md') {
    return window.showSaveFilePicker({ suggestedName, types: MARKDOWN_TYPES });
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
};
