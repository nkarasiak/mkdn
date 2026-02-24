import { commandRegistry } from '../command-palette/command-registry.js';
import { openPluginManager } from './plugin-manager-ui.js';
import { pluginRegistry } from './plugin-registry.js';
import { loadPlugin, loadSandboxedPlugin } from './plugin-loader.js';

export async function registerPluginCommands() {
  commandRegistry.registerMany([
    {
      id: 'plugins:manage',
      label: 'Plugins: Manage Plugins',
      category: 'Plugins',
      keywords: ['plugin', 'extension', 'addon', 'manage', 'install', 'enable', 'disable'],
      action: openPluginManager,
    },
    {
      id: 'plugins:add',
      label: 'Plugins: Add Plugin from URL',
      category: 'Plugins',
      keywords: ['plugin', 'add', 'install', 'url'],
      action: openPluginManager,
    },
  ]);

  // Auto-load enabled plugins
  await autoLoadPlugins();
}

async function autoLoadPlugins() {
  const enabledIds = pluginRegistry.getEnabledPluginIds();

  // Load enabled builtin plugins
  const builtins = pluginRegistry.getBuiltinPlugins();
  for (const plugin of builtins) {
    if (enabledIds.includes(plugin.id)) {
      try {
        await loadSandboxedPlugin(plugin.id, plugin.name, plugin.code);
      } catch (e) {
        console.warn(`Failed to auto-load builtin plugin "${plugin.name}":`, e);
      }
    }
  }

  // Load enabled installed plugins
  const installed = pluginRegistry.getInstalledPlugins();
  for (const plugin of installed) {
    if (enabledIds.includes(plugin.id)) {
      try {
        await loadPlugin(plugin.url);
      } catch (e) {
        console.warn(`Failed to auto-load plugin "${plugin.name}":`, e);
      }
    }
  }
}
