import { settingsStore } from '../store/settings-store.js';
import { toast } from '../ui/toast.js';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.0;
const WHEEL_STEP = 0.1;
const KEY_STEP = 0.1;

let toastTimer = null;

function clamp(v) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(v * 100) / 100));
}

function apply(zoom) {
  document.documentElement.style.setProperty('--editor-zoom', String(zoom));
}

function showZoomToast(zoom) {
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
  toastTimer = setTimeout(() => {
    toast(`Zoom ${Math.round(zoom * 100)}%`, 'info', 1200);
    toastTimer = null;
  }, 120);
}

export const editorZoom = {
  init(targetEl) {
    apply(clamp(settingsStore.get('editorZoom') ?? 1));

    targetEl.addEventListener('wheel', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const direction = e.deltaY < 0 ? 1 : -1;
      this.setZoom(this.getZoom() + direction * WHEEL_STEP);
    }, { passive: false });
  },

  getZoom() {
    return clamp(settingsStore.get('editorZoom') ?? 1);
  },

  setZoom(value) {
    const z = clamp(value);
    settingsStore.set('editorZoom', z);
    apply(z);
    showZoomToast(z);
  },

  zoomIn() {
    this.setZoom(this.getZoom() + KEY_STEP);
  },

  zoomOut() {
    this.setZoom(this.getZoom() - KEY_STEP);
  },

  reset() {
    this.setZoom(1);
  },
};
