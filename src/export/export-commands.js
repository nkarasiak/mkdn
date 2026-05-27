import { commandRegistry } from '../command-palette/command-registry.js';
import { exportStyledHtml, getThemes } from './html-export.js';

export function registerExportCommands() {
  const themes = getThemes();

  commandRegistry.registerMany([
    // HTML export with themes
    ...Object.entries(themes).map(([id, theme]) => ({
      id: `export:html-${id}`,
      label: `Export HTML (${theme.name})`,
      category: 'Export',
      keywords: ['export', 'html', theme.name.toLowerCase(), 'download'],
      action: () => exportStyledHtml(id),
    })),
  ]);
}
