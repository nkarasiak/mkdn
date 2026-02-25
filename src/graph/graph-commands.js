import { commandRegistry } from '../command-palette/command-registry.js';

export function registerGraphCommands() {
  commandRegistry.registerMany([
    {
      id: 'tools:knowledge-graph',
      label: 'Knowledge Graph',
      category: 'Tools',
      shortcut: 'Ctrl+Shift+G',
      keywords: ['graph', 'network', 'connections', 'map', 'links', 'wiki', 'visualize'],
      action: () => import('./graph-view.js').then(m => m.openGraphView()),
    },
  ]);
}
