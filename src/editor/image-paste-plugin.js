import { Plugin } from '@milkdown/prose/state';

/**
 * ProseMirror plugin that handles image paste from clipboard
 * and drag-and-drop image insertion.
 * Images are stored as base64 data URIs inline.
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

function insertImageFromFile(view, file, pos) {
  // Limit file size to 5MB
  if (file.size > 5 * 1024 * 1024) {
    import('../ui/toast.js').then(({ toast }) => toast('Image too large (max 5MB)', 'warning'));
    return;
  }

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
