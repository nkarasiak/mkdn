const listeners = new Map();

export const eventBus = {
  on(event, callback) {
    if (!listeners.has(event)) {
      listeners.set(event, new Set());
    }
    listeners.get(event).add(callback);
    return () => listeners.get(event)?.delete(callback);
  },

  emit(event, data) {
    listeners.get(event)?.forEach(cb => cb(data));
  },

  off(event, callback) {
    listeners.get(event)?.delete(callback);
  },
};
