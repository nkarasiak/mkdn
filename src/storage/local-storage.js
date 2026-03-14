export const storage = {
  get(key, fallback = null) {
    try {
      const val = localStorage.getItem(key);
      return val !== null ? JSON.parse(val) : fallback;
    } catch {
      return fallback;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.error(`[storage] Failed to save "${key}":`, err.message);
      storage._lastError = err;
    }
  },

  remove(key) {
    localStorage.removeItem(key);
  },

  _lastError: null,
};
