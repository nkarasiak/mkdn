import { Plugin } from '@milkdown/prose/state';
import { localSync } from '../local/local-sync.js';

/**
 * ProseMirror plugin that handles image paste from clipboard
 * and drag-and-drop image insertion.
 *
 * When a local folder is linked, images are saved to an assets/
 * subfolder and referenced by relative path. Otherwise, falls back
 * to inline base64 data URIs.
 */
export function createImagePastePlugin() {
  return new Plugin({
    props: {
      handlePaste(view, event) {
        const items = event.clipboardData?.items;
        if (!items) return false;

        for (const item of items) {
          if (item.type.startsWith('image/')) {
            event.preventDefault();
            const file = item.getAsFile();
            if (file) {
              insertImageFromFile(view, file);
              return true;
            }
          }
        }
        return false;
      },

      handleDrop(view, event) {
        const files = event.dataTransfer?.files;
        if (!files?.length) return false;

        const imageFile = [...files].find(f => f.type.startsWith('image/'));
        if (!imageFile) return false;

        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (pos) {
          insertImageFromFile(view, imageFile, pos.pos);
        }
        return true;
      },
    },
  });
}

/**
 * Generate a unique filename by appending a timestamp suffix
 * to avoid collisions in the assets folder.
 */
function generateImageFilename(file) {
  const ext = file.name.includes('.')
    ? file.name.slice(file.name.lastIndexOf('.'))
    : `.${file.type.split('/')[1] || 'png'}`;
  const baseName = file.name.includes('.')
    ? file.name.slice(0, file.name.lastIndexOf('.'))
    : file.name || 'image';
  // Sanitise: keep only alphanumerics, hyphens, underscores
  const safe = baseName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
  const stamp = Date.now().toString(36);
  return `${safe}-${stamp}${ext}`;
}

/**
 * Save an image File to the linked folder's assets/ directory.
 * Returns the relative markdown path (e.g. "assets/photo-abc.png")
 * or null if saving failed.
 */
async function saveImageToAssets(file) {
  const dirHandle = localSync.getDirHandle();
  if (!dirHandle) return null;

  try {
    // Ensure assets/ subdirectory exists
    const assetsHandle = await dirHandle.getDirectoryHandle('assets', { create: true });

    const filename = generateImageFilename(file);
    const fileHandle = await assetsHandle.getFileHandle(filename, { create: true });

    // Read file contents as ArrayBuffer
    const buffer = await file.arrayBuffer();

    // Write binary data
    const writable = await fileHandle.createWritable();
    await writable.write(buffer);
    await writable.close();

    return `assets/${filename}`;
  } catch (err) {
    console.warn('Failed to save image to assets/', err);
    return null;
  }
}

/**
 * Save an image File to assets/ in Tauri mode where the dirHandle
 * is a PathHandle (path-based, no createWritable). Uses
 * @tauri-apps/plugin-fs to write binary data.
 */
async function saveImageToAssetsTauri(file, dirHandle) {
  try {
    const fsModule = await import('@tauri-apps/plugin-fs');
    const sep = dirHandle.path.includes('\\') ? '\\' : '/';
    const assetsPath = dirHandle.path + sep + 'assets';

    // Ensure assets/ directory exists
    try {
      await fsModule.mkdir(assetsPath);
    } catch {
      // Directory may already exist — ignore
    }

    const filename = generateImageFilename(file);
    const filePath = assetsPath + sep + filename;

    const buffer = await file.arrayBuffer();
    await fsModule.writeFile(filePath, new Uint8Array(buffer));

    return `assets/${filename}`;
  } catch (err) {
    console.warn('Failed to save image to assets/ (Tauri)', err);
    return null;
  }
}

/**
 * Detect whether we're running inside Tauri.
 */
function isTauri() {
  return !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
}

async function insertImageFromFile(view, file, pos) {
  // Limit file size to 5MB
  if (file.size > 5 * 1024 * 1024) {
    import('../ui/toast.js').then(({ toast }) => toast('Image too large (max 5MB)', 'warning'));
    return;
  }

  // Try saving to local assets/ folder when a folder is linked
  if (localSync.isLinked()) {
    const dirHandle = localSync.getDirHandle();
    let relativePath = null;

    if (isTauri()) {
      relativePath = await saveImageToAssetsTauri(file, dirHandle);
    } else {
      relativePath = await saveImageToAssets(file);
    }

    if (relativePath) {
      const { state, dispatch } = view;
      const imageNode = state.schema.nodes.image.create({
        src: relativePath,
        alt: file.name,
      });
      const insertPos = pos != null ? pos : state.selection.from;
      const tr = state.tr.insert(insertPos, imageNode);
      dispatch(tr.scrollIntoView());
      return;
    }
    // If saving to assets failed, fall through to base64 fallback
  }

  // Fallback: embed as base64 data URI (no folder linked or save failed)
  const reader = new FileReader();
  reader.onload = () => {
    const { state, dispatch } = view;
    const imageNode = state.schema.nodes.image.create({
      src: reader.result,
      alt: file.name,
    });

    const insertPos = pos != null ? pos : state.selection.from;
    const tr = state.tr.insert(insertPos, imageNode);
    dispatch(tr.scrollIntoView());
  };
  reader.readAsDataURL(file);
}

export { saveImageToAssets, saveImageToAssetsTauri, isTauri, generateImageFilename };
