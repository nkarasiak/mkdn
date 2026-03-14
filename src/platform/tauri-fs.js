// Native file system operations via Tauri v2 plugins
// Patches localFs + handleStore when running in Tauri desktop app

import { localFs } from '../local/local-fs.js';
import { handleStore } from '../storage/handle-store.js';

const FOLDER_KEY = 'mkdn-tauri-folder';

let fsModule = null;
let dialogModule = null;

async function ensureModules() {
  if (!fsModule) fsModule = await import('@tauri-apps/plugin-fs');
  if (!dialogModule) dialogModule = await import('@tauri-apps/plugin-dialog');
}

// Path-based handle wrapper — compatible with the FileHandle interface
// used by localSync (handle.name, handle.path, etc.)
class PathHandle {
  constructor(path, kind = 'file') {
    this.path = path;
    this.kind = kind;
    this.name = path.split('/').pop().split('\\').pop();
  }

  async getFile() {
    await ensureModules();
    const content = await fsModule.readTextFile(this.path);
    let mtime = Date.now();
    try {
      const stat = await fsModule.stat(this.path);
      if (stat.mtime) mtime = new Date(stat.mtime).getTime();
    } catch { /* stat may not be available */ }
    return {
      name: this.name,
      text: () => Promise.resolve(content),
      lastModified: mtime,
    };
  }

  async requestPermission() {
    return 'granted';
  }

  async getDirectoryHandle(name) {
    return new PathHandle(joinPath(this.path, name), 'directory');
  }

  async getFileHandle(name, opts) {
    const p = joinPath(this.path, name);
    if (opts?.create) {
      await ensureModules();
      await fsModule.writeTextFile(p, '');
    }
    return new PathHandle(p, 'file');
  }

  async removeEntry(name) {
    await ensureModules();
    await fsModule.remove(joinPath(this.path, name));
  }

  async *values() {
    await ensureModules();
    const entries = await fsModule.readDir(this.path);
    for (const entry of entries) {
      yield new PathHandle(
        joinPath(this.path, entry.name),
        entry.isDirectory ? 'directory' : 'file',
      );
    }
  }
}

function joinPath(base, name) {
  const sep = base.includes('\\') ? '\\' : '/';
  return base + sep + name;
}

// Patch localFs to use Tauri native APIs
export function patchLocalFs() {
  // Always supported in Tauri
  localFs.isSupported = () => true;

  localFs.pickDirectory = async () => {
    await ensureModules();
    const path = await dialogModule.open({ directory: true, title: 'Open Folder' });
    if (!path) throw new Error('cancelled');
    return new PathHandle(path, 'directory');
  };

  localFs.pickFile = async () => {
    await ensureModules();
    const path = await dialogModule.open({
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
      title: 'Open Markdown File',
    });
    if (!path) throw new Error('cancelled');
    return new PathHandle(path, 'file');
  };

  localFs.pickSaveFile = async (suggestedName = 'Untitled.md') => {
    await ensureModules();
    const path = await dialogModule.save({
      defaultPath: suggestedName,
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
      title: 'Save Markdown File',
    });
    if (!path) throw new Error('cancelled');
    return new PathHandle(path, 'file');
  };

  localFs.requestPermission = async () => 'granted';

  localFs.readFile = async (handle) => {
    await ensureModules();
    const path = handle?.path || handle;
    const content = await fsModule.readTextFile(path);
    let modifiedTime = Date.now();
    try {
      const stat = await fsModule.stat(path);
      if (stat.mtime) modifiedTime = new Date(stat.mtime).getTime();
    } catch { /* ignore */ }
    const name = String(path).split('/').pop().split('\\').pop();
    return { name, content, modifiedTime };
  };

  localFs.writeFile = async (handle, content) => {
    await ensureModules();
    const path = handle?.path || handle;
    await fsModule.writeTextFile(path, content);
  };

  localFs.createFile = async (dirHandle, name, content) => {
    await ensureModules();
    const path = joinPath(dirHandle.path, name);
    await fsModule.writeTextFile(path, content);
    return new PathHandle(path, 'file');
  };

  localFs.deleteFile = async (dirHandle, filePath) => {
    await ensureModules();
    await fsModule.remove(joinPath(dirHandle.path, filePath));
  };

  localFs.renameFile = async (dirHandle, oldPath, newName) => {
    await ensureModules();
    const fullOldPath = joinPath(dirHandle.path, oldPath);
    const parts = oldPath.split('/');
    parts.pop();
    const newPath = parts.length
      ? joinPath(dirHandle.path, parts.join('/') + '/' + newName)
      : joinPath(dirHandle.path, newName);
    await fsModule.rename(fullOldPath, newPath);
  };

  localFs.getFileHandle = async (dirHandle, path) => {
    return new PathHandle(joinPath(dirHandle.path, path), 'file');
  };

  localFs.listMarkdownFiles = async (dirHandle) => {
    await ensureModules();
    const files = [];
    await walkDirectory(dirHandle.path, '', files);
    files.sort((a, b) => b.modifiedTime - a.modifiedTime);
    return files;
  };

  // Patch handleStore to use localStorage (IndexedDB can't store PathHandle)
  handleStore.saveHandle = async (handle) => {
    localStorage.setItem(FOLDER_KEY, handle.path);
  };

  handleStore.loadHandle = async () => {
    const path = localStorage.getItem(FOLDER_KEY);
    return path ? new PathHandle(path, 'directory') : null;
  };

  handleStore.clearHandle = async () => {
    localStorage.removeItem(FOLDER_KEY);
  };
}

async function walkDirectory(basePath, prefix, results) {
  await ensureModules();
  const fullPath = prefix ? joinPath(basePath, prefix) : basePath;

  let entries;
  try {
    entries = await fsModule.readDir(fullPath);
  } catch {
    return; // Permission denied or not a directory
  }

  for (const entry of entries) {
    // Skip hidden files/directories
    if (entry.name.startsWith('.')) continue;

    const path = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory) {
      await walkDirectory(basePath, path, results);
    } else if (entry.name.endsWith('.md')) {
      let modifiedTime = Date.now();
      try {
        const stat = await fsModule.stat(joinPath(fullPath, entry.name));
        if (stat.mtime) modifiedTime = new Date(stat.mtime).getTime();
      } catch { /* ignore */ }

      results.push({
        name: entry.name,
        path,
        handle: new PathHandle(joinPath(fullPath, entry.name)),
        modifiedTime,
      });
    }
  }
}
