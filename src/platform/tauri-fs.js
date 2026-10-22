// Native file system operations via Tauri v2 plugins.
// Patches localFs when running in the Tauri desktop app; handles are plain absolute paths.

import { localFs } from '../local/local-fs.js';

const FILTERS = [{ name: 'Markdown', extensions: ['md', 'markdown'] }];

export function patchLocalFs() {
  const fs = () => import('@tauri-apps/plugin-fs');
  const dialog = () => import('@tauri-apps/plugin-dialog');

  localFs.isSupported = () => true;

  localFs.pickFile = async () => {
    const path = await (await dialog()).open({ filters: FILTERS, title: 'Open Markdown File' });
    if (!path) throw new Error('cancelled');
    return path;
  };

  localFs.pickSaveFile = async (suggestedName = 'Untitled.md') => {
    const path = await (await dialog()).save({ defaultPath: suggestedName, filters: FILTERS, title: 'Save Markdown File' });
    if (!path) throw new Error('cancelled');
    return path;
  };

  localFs.readFile = async (path) => {
    const { readTextFile, stat } = await fs();
    const content = await readTextFile(path);
    let modifiedTime = Date.now();
    try {
      const s = await stat(path);
      if (s.mtime) modifiedTime = new Date(s.mtime).getTime();
    } catch { /* stat may not be available */ }
    return { name: path.split(/[\\/]/).pop(), content, modifiedTime };
  };

  localFs.writeFile = async (path, content) => {
    await (await fs()).writeTextFile(path, content);
  };
}
