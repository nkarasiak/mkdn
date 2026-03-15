import { commandRegistry } from '../command-palette/command-registry.js';

export function registerCanvasCommands() {
  commandRegistry.registerMany([
    {
      id: 'tools:canvas',
      label: 'Canvas / Whiteboard',
      category: 'Tools',
      keywords: ['canvas', 'whiteboard', 'board', 'freeform', 'diagram', 'mindmap', 'cards'],
      action: () => {
        import('./canvas-mode.js').then(m => m.openCanvasMode());
      },
    },
  ]);
}
