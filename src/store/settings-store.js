import { eventBus } from './event-bus.js';

const STORAGE_KEY = 'mkdn-settings';

const defaults = {
  theme: 'light',
  fontSize: 15,
  sidebarOpen: false,
  autoSaveInterval: 30000,
  zenMode: false,
  paragraphFocus: false,
  typewriterMode: false,
};

function load() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed = stored ? { ...defaults, ...JSON.parse(stored) } : { ...defaults };
    // Remove legacy viewMode if present
    delete parsed.viewMode;
    // Sidebar always starts collapsed
    parsed.sidebarOpen = false;
    // Focus modes never persist across reload
    parsed.zenMode = false;
    parsed.paragraphFocus = false;
    parsed.typewriterMode = false;
    return parsed;
  } catch {
    return { ...defaults };
  }
}

function save(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
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
};
