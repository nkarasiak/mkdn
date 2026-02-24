import { el } from '../utils/dom.js';
import { pluginRegistry } from './plugin-registry.js';
import { loadPlugin, loadSandboxedPlugin, unloadPlugin, getLoadedPlugins, isPluginLoaded } from './plugin-loader.js';
import { toast } from '../ui/toast.js';

export function openPluginManager() {
  const overlay = el('div', { className: 'ai-settings-overlay' });

  const content = el('div', { className: 'plugin-manager-content' });

  function renderPluginList() {
    content.replaceChildren();

    // Builtin plugins
    const builtins = pluginRegistry.getBuiltinPlugins();
    content.appendChild(el('h4', { style: { margin: '0 0 12px', fontSize: '14px', color: 'var(--text-secondary)' } }, 'Built-in Plugins'));

    for (const plugin of builtins) {
      const loaded = isPluginLoaded(plugin.id);
      const enabled = pluginRegistry.isEnabled(plugin.id);

      const toggleBtn = el('button', {
        className: loaded ? 'collab-btn-danger' : 'collab-btn-primary',
        style: { padding: '4px 12px', fontSize: '12px' },
        onClick: async () => {
          if (loaded) {
            unloadPlugin(plugin.id);
            pluginRegistry.setPluginEnabled(plugin.id, false);
          } else {
            await loadSandboxedPlugin(plugin.id, plugin.name, plugin.code);
            pluginRegistry.setPluginEnabled(plugin.id, true);
          }
          renderPluginList();
        },
      }, loaded ? 'Disable' : 'Enable');

      content.appendChild(el('div', { className: 'plugin-item' },
        el('div', { className: 'plugin-item-info' },
          el('div', { className: 'plugin-item-name' }, plugin.name),
          el('div', { className: 'plugin-item-desc' }, plugin.description),
        ),
        toggleBtn,
      ));
    }

    // Installed external plugins
    const installed = pluginRegistry.getInstalledPlugins();
    if (installed.length > 0) {
      content.appendChild(el('h4', { style: { margin: '16px 0 12px', fontSize: '14px', color: 'var(--text-secondary)' } }, 'Installed Plugins'));

      for (const plugin of installed) {
        const loaded = isPluginLoaded(plugin.id);

        const toggleBtn = el('button', {
          className: loaded ? 'collab-btn-danger' : 'collab-btn-primary',
          style: { padding: '4px 12px', fontSize: '12px' },
          onClick: async () => {
            if (loaded) {
              unloadPlugin(plugin.id);
              pluginRegistry.setPluginEnabled(plugin.id, false);
            } else {
              await loadPlugin(plugin.url);
              pluginRegistry.setPluginEnabled(plugin.id, true);
            }
            renderPluginList();
          },
        }, loaded ? 'Disable' : 'Enable');

        const removeBtn = el('button', {
          className: 'collab-btn-secondary',
          style: { padding: '4px 12px', fontSize: '12px' },
          onClick: () => {
            if (loaded) unloadPlugin(plugin.id);
            pluginRegistry.uninstallPlugin(plugin.id);
            pluginRegistry.setPluginEnabled(plugin.id, false);
            renderPluginList();
            toast(`Removed "${plugin.name}"`, 'info');
          },
        }, 'Remove');

        content.appendChild(el('div', { className: 'plugin-item' },
          el('div', { className: 'plugin-item-info' },
            el('div', { className: 'plugin-item-name' }, `${plugin.name} v${plugin.version || '?'}`),
            el('div', { className: 'plugin-item-desc' }, plugin.url),
          ),
          el('div', { style: { display: 'flex', gap: '4px' } }, toggleBtn, removeBtn),
        ));
      }
    }

    // Add plugin from URL
    content.appendChild(el('h4', { style: { margin: '16px 0 12px', fontSize: '14px', color: 'var(--text-secondary)' } }, 'Add Plugin'));

    const urlInput = el('input', {
      type: 'text',
      className: 'ai-settings-input',
      placeholder: 'https://example.com/my-plugin.js',
      style: { width: '100%' },
    });

    const addBtn = el('button', {
      className: 'collab-btn-primary',
      style: { padding: '6px 16px', fontSize: '13px', marginTop: '8px' },
      onClick: async () => {
        const url = urlInput.value.trim();
        if (!url) return;

        const result = await loadPlugin(url);
        if (result) {
          pluginRegistry.installPlugin({ id: result.id, name: result.name, version: result.version, url });
          pluginRegistry.setPluginEnabled(result.id, true);
          urlInput.value = '';
          renderPluginList();
        }
      },
    }, 'Add Plugin');

    content.appendChild(urlInput);
    content.appendChild(addBtn);
  }

  renderPluginList();

  const dialog = el('div', { className: 'ai-settings-dialog', style: { width: '500px', maxHeight: '70vh' } },
    el('h3', {}, 'Plugin Manager'),
    el('div', { style: { overflowY: 'auto', flex: '1' } }, content),
    el('div', { className: 'ai-settings-actions' },
      el('button', {
        className: 'collab-btn-secondary',
        onClick: () => overlay.remove(),
      }, 'Close'),
    ),
  );

  overlay.appendChild(dialog);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
}
