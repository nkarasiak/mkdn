import { commandRegistry } from '../command-palette/command-registry.js';
import { localSync } from '../local/local-sync.js';
import { toast } from '../ui/toast.js';

export function registerGraphCommands() {
  commandRegistry.registerMany([
    {
      id: 'tools:knowledge-graph',
      label: 'Knowledge Graph',
      category: 'Tools',
      shortcut: 'Ctrl+Shift+G',
      keywords: ['graph', 'network', 'connections', 'map', 'links', 'wiki', 'visualize'],
      action: () => {
        if (!localSync.isLinked()) {
          toast('Link a local folder with [[wiki-links]] to use the knowledge graph', 'info');
          return;
        }
        import('./graph-view.js').then(m => m.openGraphView());
      },
    },
  ]);
}
