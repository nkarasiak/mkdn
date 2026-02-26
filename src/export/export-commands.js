import { commandRegistry } from '../command-palette/command-registry.js';
import { exportStyledHtml, getThemes } from './html-export.js';
import { exportDocx } from './docx-export.js';
import { enterSlideMode, exportSlidesHtml } from './slides.js';
import { openGithubPublish } from './github-publish.js';

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

    // DOCX
    {
      id: 'export:docx',
      label: 'Export as Word (DOCX)',
      category: 'Export',
      keywords: ['export', 'word', 'docx', 'document', 'office'],
      action: exportDocx,
    },

    // Slides
    {
      id: 'export:slides-present',
      label: 'Present as Slides',
      category: 'Export',
      keywords: ['slides', 'presentation', 'present', 'fullscreen', 'deck'],
      action: enterSlideMode,
    },
    {
      id: 'export:slides-html',
      label: 'Export Slides as HTML',
      category: 'Export',
      keywords: ['slides', 'export', 'html', 'presentation'],
      action: exportSlidesHtml,
    },

    // GitHub
    {
      id: 'export:github',
      label: 'Publish to GitHub',
      category: 'Export',
      keywords: ['github', 'publish', 'push', 'repo', 'repository'],
      action: openGithubPublish,
    },

  ]);
}
