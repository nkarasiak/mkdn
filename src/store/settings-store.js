import { eventBus } from './event-bus.js';
import { STORAGE_SETTINGS } from '../constants.js';

const defaults = {
  theme: 'auto',
  fontSize: 15,
  editorZoom: 1,
  contentMaxWidth: null,
  sidebarOpen: false,
  autoSaveInterval: 30000,
  zenMode: false,
  writingMode: false,
  paragraphFocus: false,
  typewriterMode: false,
  sourceMode: false,
  fullWidth: false,
  sidebarSections: { localFolder: true, outline: true, history: true, backlinks: true },
  sidebarOrder: ['localFolder', 'outline', 'backlinks', 'history'],
  accentColor: null,
  customFont: null,
  authorByline: '',
  writingDropCap: true,
};

function load() {
  try {
    const stored = localStorage.getItem(STORAGE_SETTINGS);
    const parsed = { ...defaults };
    if (stored) {
      const raw = JSON.parse(stored);
      for (const key of Object.keys(defaults)) {
        if (Object.prototype.hasOwnProperty.call(raw, key)) {
          parsed[key] = raw[key];
        }
      }
    }
    // Sidebar always starts collapsed
    parsed.sidebarOpen = false;
    // Focus modes never persist across reload
    parsed.zenMode = false;
    parsed.writingMode = false;
    parsed.paragraphFocus = false;
    parsed.typewriterMode = false;
    parsed.sourceMode = false;
    parsed.fullWidth = false;
    return parsed;
  } catch {
    return { ...defaults };
  }
}

function save(settings) {
  try {
    localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(settings));
  } catch { /* quota exceeded, ignore */ }
}

let settings = load();

export const settingsStore = {
  get(key) {
    return settings[key];
  },

  set(key, value) {
    if (settings[key] === value) return;
    settings[key] = value;
    save(settings);
    eventBus.emit(`settings:${key}`, value);
    eventBus.emit('settings:changed', { key, value });
  },

  getAll() {
    return { ...settings };
  },

  getTheme() {
    return settings.theme;
  },

  /** Resolve 'auto' to actual light/dark based on system preference */
  getResolvedTheme() {
    if (settings.theme === 'auto') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return settings.theme;
  },
};
