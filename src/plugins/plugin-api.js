import { eventBus } from '../store/event-bus.js';
import { documentStore } from '../store/document-store.js';
import { settingsStore } from '../store/settings-store.js';
import { commandRegistry } from '../command-palette/command-registry.js';
import { milkdown } from '../editor/milkdown-setup.js';
import { toast } from '../ui/toast.js';
import { el } from '../utils/dom.js';

/**
 * Create a sandboxed API object for a plugin.
 * Each plugin gets its own API instance to track registrations for cleanup.
 */
export function createPluginAPI(pluginId) {
  const registeredCommands = [];
  const registeredListeners = [];
  const registeredSlashCommands = [];

  return {
    // Plugin identity
    pluginId,

    // Event bus (subscribe only, no emit for most events)
    on(event, callback) {
      const unsub = eventBus.on(event, callback);
      registeredListeners.push(unsub);
      return unsub;
    },

    emit(event, data) {
      // Only allow plugin-namespaced events
      if (!event.startsWith('plugin:')) {
        throw new Error(`Plugins can only emit events prefixed with "plugin:". Got: "${event}"`);
      }
      eventBus.emit(event, data);
    },

    // Document access (read-only + controlled write)
    getMarkdown() {
      return documentStore.getMarkdown();
    },

    getFileName() {
      return documentStore.getFileName();
    },

    getFileId() {
      return documentStore.getFileId();
    },

    setMarkdown(content) {
      documentStore.setMarkdown(content, `plugin:${pluginId}`);
    },

    // Settings (namespaced per plugin)
    getSetting(key) {
      return settingsStore.get(`plugin:${pluginId}:${key}`);
    },

    setSetting(key, value) {
      settingsStore.set(`plugin:${pluginId}:${key}`, value);
    },

    // Command palette
    registerCommand(cmd) {
      const fullId = `plugin:${pluginId}:${cmd.id}`;
      const command = {
        ...cmd,
        id: fullId,
        category: cmd.category || 'Plugins',
      };
      commandRegistry.register(command);
      registeredCommands.push(fullId);
      return fullId;
    },

    // Slash commands (register a /command handler)
    registerSlashCommand(name, description, handler) {
      const cmd = {
        name: name.startsWith('/') ? name : `/${name}`,
        description,
        handler,
        pluginId,
      };
      registeredSlashCommands.push(cmd);
      // Register as a command palette command too
      this.registerCommand({
        id: `slash-${name}`,
        label: `/${name} - ${description}`,
        keywords: ['slash', name],
        action: () => handler({ api: this }),
      });
      return cmd;
    },

    // Editor operations
    getSelectedText() {
      return milkdown.getSelectedText();
    },

    insertText(text) {
      const view = milkdown.getView();
      if (view) {
        const { from } = view.state.selection;
        const tr = view.state.tr.insertText(text, from);
        view.dispatch(tr);
      }
    },

    replaceSelection(text) {
      const view = milkdown.getView();
      if (view) {
        const { from, to } = view.state.selection;
        const tr = view.state.tr.insertText(text, from, to);
        view.dispatch(tr);
      }
    },

    // UI helpers
    toast(message, type = 'info', duration = 3000) {
      return toast(message, type, duration);
    },

    // DOM helper
    createElement: el,

    // Storage (plugin-namespaced localStorage)
    storage: {
      get(key) {
        try {
          const val = localStorage.getItem(`mkdn-plugin-${pluginId}-${key}`);
          return val ? JSON.parse(val) : null;
        } catch { return null; }
      },
      set(key, value) {
        try {
          localStorage.setItem(`mkdn-plugin-${pluginId}-${key}`, JSON.stringify(value));
        } catch { /* quota exceeded */ }
      },
      remove(key) {
        localStorage.removeItem(`mkdn-plugin-${pluginId}-${key}`);
      },
    },

    // Cleanup helper - called when plugin is unloaded
    _cleanup() {
      // Remove event listeners
      for (const unsub of registeredListeners) {
        unsub();
      }
      // Note: command removal from registry would need registry support
      // For now, commands persist until page reload
      registeredCommands.length = 0;
      registeredListeners.length = 0;
      registeredSlashCommands.length = 0;
    },

    _getSlashCommands() {
      return [...registeredSlashCommands];
    },
  };
}
