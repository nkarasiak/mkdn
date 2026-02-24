import { createPluginAPI } from './plugin-api.js';
import { toast } from '../ui/toast.js';

const loadedPlugins = new Map(); // id -> { manifest, api, module, iframe }

/**
 * Load a trusted plugin from a URL (ES module).
 * The module should export: { id, name, version, init(api), destroy?() }
 */
export async function loadPlugin(url) {
  try {
    const module = await import(/* @vite-ignore */ url);

    if (!module.id || !module.init) {
      throw new Error('Plugin must export "id" and "init"');
    }

    if (loadedPlugins.has(module.id)) {
      toast(`Plugin "${module.name || module.id}" is already loaded`, 'warning');
      return null;
    }

    const api = createPluginAPI(module.id);

    await module.init(api);

    const pluginInfo = {
      id: module.id,
      name: module.name || module.id,
      version: module.version || '0.0.0',
      description: module.description || '',
      url,
      api,
      module,
      trusted: true,
    };

    loadedPlugins.set(module.id, pluginInfo);
    toast(`Plugin "${pluginInfo.name}" loaded`, 'success');

    return pluginInfo;
  } catch (e) {
    toast(`Failed to load plugin: ${e.message}`, 'error');
    return null;
  }
}

/**
 * Load an untrusted plugin in a sandboxed iframe.
 * The plugin communicates via postMessage.
 */
export async function loadSandboxedPlugin(id, name, code) {
  if (loadedPlugins.has(id)) {
    toast(`Plugin "${name}" is already loaded`, 'warning');
    return null;
  }

  const api = createPluginAPI(id);

  // Create sandboxed iframe
  const iframe = document.createElement('iframe');
  iframe.sandbox = 'allow-scripts';
  iframe.style.display = 'none';

  // Build the sandbox HTML with a postMessage-based API bridge
  const sandboxHtml = `
    <!DOCTYPE html>
    <html>
    <head><script>
      const mkdn = {
        _pending: new Map(),
        _nextId: 0,

        _call(method, args) {
          return new Promise((resolve, reject) => {
            const id = this._nextId++;
            this._pending.set(id, { resolve, reject });
            parent.postMessage({ type: 'plugin-call', pluginId: '${id}', callId: id, method, args }, '*');
          });
        },

        getMarkdown() { return this._call('getMarkdown', []); },
        getFileName() { return this._call('getFileName', []); },
        getSelectedText() { return this._call('getSelectedText', []); },
        insertText(text) { return this._call('insertText', [text]); },
        replaceSelection(text) { return this._call('replaceSelection', [text]); },
        toast(msg, type) { return this._call('toast', [msg, type]); },
        registerCommand(cmd) { return this._call('registerCommand', [cmd]); },
        storage: {
          get(key) { return mkdn._call('storage.get', [key]); },
          set(key, value) { return mkdn._call('storage.set', [key, value]); },
        },
      };

      window.addEventListener('message', (e) => {
        if (e.data.type === 'plugin-response') {
          const pending = mkdn._pending.get(e.data.callId);
          if (pending) {
            mkdn._pending.delete(e.data.callId);
            if (e.data.error) pending.reject(new Error(e.data.error));
            else pending.resolve(e.data.result);
          }
        }
      });
    <\/script></head>
    <body><script>
      try {
        ${code}
      } catch(e) {
        parent.postMessage({ type: 'plugin-error', pluginId: '${id}', error: e.message }, '*');
      }
    <\/script></body>
    </html>
  `;

  // Listen for messages from the sandbox
  const messageHandler = async (e) => {
    if (e.data?.type !== 'plugin-call' || e.data.pluginId !== id) return;

    const { callId, method, args } = e.data;
    let result, error;

    try {
      switch (method) {
        case 'getMarkdown': result = api.getMarkdown(); break;
        case 'getFileName': result = api.getFileName(); break;
        case 'getSelectedText': result = api.getSelectedText(); break;
        case 'insertText': api.insertText(args[0]); result = true; break;
        case 'replaceSelection': api.replaceSelection(args[0]); result = true; break;
        case 'toast': api.toast(args[0], args[1]); result = true; break;
        case 'registerCommand':
          // Sandboxed commands execute via postMessage
          const cmd = args[0];
          cmd.action = () => {
            iframe.contentWindow.postMessage({ type: 'command-execute', commandId: cmd.id }, '*');
          };
          result = api.registerCommand(cmd);
          break;
        case 'storage.get': result = api.storage.get(args[0]); break;
        case 'storage.set': api.storage.set(args[0], args[1]); result = true; break;
        default: error = `Unknown method: ${method}`;
      }
    } catch (e) {
      error = e.message;
    }

    iframe.contentWindow?.postMessage({
      type: 'plugin-response',
      callId,
      result,
      error,
    }, '*');
  };

  window.addEventListener('message', messageHandler);

  // Set iframe content
  const blob = new Blob([sandboxHtml], { type: 'text/html' });
  iframe.src = URL.createObjectURL(blob);
  document.body.appendChild(iframe);

  const pluginInfo = {
    id,
    name,
    version: '0.0.0',
    description: 'Sandboxed plugin',
    api,
    iframe,
    messageHandler,
    trusted: false,
  };

  loadedPlugins.set(id, pluginInfo);
  toast(`Plugin "${name}" loaded (sandboxed)`, 'success');

  return pluginInfo;
}

/**
 * Unload a plugin by ID.
 */
export function unloadPlugin(id) {
  const plugin = loadedPlugins.get(id);
  if (!plugin) return;

  // Call destroy if available
  if (plugin.module?.destroy) {
    try { plugin.module.destroy(); } catch {}
  }

  // Cleanup API registrations
  plugin.api._cleanup();

  // Remove sandboxed iframe
  if (plugin.iframe) {
    window.removeEventListener('message', plugin.messageHandler);
    plugin.iframe.remove();
    if (plugin.iframe.src.startsWith('blob:')) {
      URL.revokeObjectURL(plugin.iframe.src);
    }
  }

  loadedPlugins.delete(id);
  toast(`Plugin "${plugin.name}" unloaded`, 'info');
}

/**
 * Get all loaded plugins.
 */
export function getLoadedPlugins() {
  return [...loadedPlugins.values()].map(p => ({
    id: p.id,
    name: p.name,
    version: p.version,
    description: p.description,
    url: p.url,
    trusted: p.trusted,
  }));
}

/**
 * Check if a plugin is loaded.
 */
export function isPluginLoaded(id) {
  return loadedPlugins.has(id);
}
