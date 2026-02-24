const STORAGE_KEY = 'mkdn-plugins';

// Built-in plugin catalog (could be fetched from a static JSON on GitHub Pages)
const builtinPlugins = [
  {
    id: 'mkdn-date',
    name: 'Date Inserter',
    description: 'Adds /date command to insert current date',
    version: '1.0.0',
    category: 'Utility',
    builtin: true,
    code: `
      if (typeof mkdn !== 'undefined') {
        mkdn.registerCommand({
          id: 'date',
          label: '/date - Insert current date',
          keywords: ['date', 'today', 'time'],
          action: () => {
            const date = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            mkdn.insertText(date);
          }
        });
      }
    `,
  },
  {
    id: 'mkdn-lorem',
    name: 'Lorem Ipsum',
    description: 'Adds /lorem command to insert placeholder text',
    version: '1.0.0',
    category: 'Utility',
    builtin: true,
    code: `
      if (typeof mkdn !== 'undefined') {
        mkdn.registerCommand({
          id: 'lorem',
          label: '/lorem - Insert Lorem Ipsum',
          keywords: ['lorem', 'ipsum', 'placeholder', 'dummy'],
          action: () => {
            mkdn.insertText('Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.');
          }
        });
      }
    `,
  },
  {
    id: 'mkdn-word-freq',
    name: 'Word Frequency',
    description: 'Analyzes word frequency in the current document',
    version: '1.0.0',
    category: 'Analysis',
    builtin: true,
    code: `
      if (typeof mkdn !== 'undefined') {
        mkdn.registerCommand({
          id: 'word-freq',
          label: 'Analyze Word Frequency',
          keywords: ['word', 'frequency', 'count', 'analyze'],
          action: async () => {
            const md = await mkdn.getMarkdown();
            const words = md.toLowerCase().replace(/[^a-z\\s]/g, '').split(/\\s+/).filter(w => w.length > 3);
            const freq = {};
            words.forEach(w => freq[w] = (freq[w] || 0) + 1);
            const top = Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0, 15);
            const report = top.map(([w, c]) => w + ': ' + c).join('\\n');
            mkdn.toast('Top words: ' + top.slice(0,5).map(([w,c]) => w+'('+c+')').join(', '));
          }
        });
      }
    `,
  },
  {
    id: 'mkdn-toc',
    name: 'Table of Contents',
    description: 'Inserts a table of contents based on headings',
    version: '1.0.0',
    category: 'Utility',
    builtin: true,
    code: `
      if (typeof mkdn !== 'undefined') {
        mkdn.registerCommand({
          id: 'toc',
          label: '/toc - Insert Table of Contents',
          keywords: ['toc', 'table', 'contents', 'headings', 'outline'],
          action: async () => {
            const md = await mkdn.getMarkdown();
            const headings = md.split('\\n').filter(l => /^#{1,6}\\s/.test(l));
            const toc = headings.map(h => {
              const level = h.match(/^#+/)[0].length;
              const text = h.replace(/^#+\\s+/, '');
              const indent = '  '.repeat(level - 1);
              const anchor = text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
              return indent + '- [' + text + '](#' + anchor + ')';
            }).join('\\n');
            mkdn.insertText('## Table of Contents\\n\\n' + toc + '\\n\\n');
          }
        });
      }
    `,
  },
];

function getInstalledPlugins() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveInstalledPlugins(plugins) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plugins));
  } catch {}
}

export const pluginRegistry = {
  getBuiltinPlugins() {
    return builtinPlugins;
  },

  getInstalledPlugins() {
    return getInstalledPlugins();
  },

  installPlugin(pluginInfo) {
    const installed = getInstalledPlugins();
    const existing = installed.findIndex(p => p.id === pluginInfo.id);
    if (existing >= 0) {
      installed[existing] = pluginInfo;
    } else {
      installed.push(pluginInfo);
    }
    saveInstalledPlugins(installed);
  },

  uninstallPlugin(id) {
    const installed = getInstalledPlugins().filter(p => p.id !== id);
    saveInstalledPlugins(installed);
  },

  isInstalled(id) {
    return getInstalledPlugins().some(p => p.id === id);
  },

  getEnabledPluginIds() {
    try {
      const stored = localStorage.getItem(`${STORAGE_KEY}-enabled`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  },

  setPluginEnabled(id, enabled) {
    const enabledIds = this.getEnabledPluginIds();
    const idx = enabledIds.indexOf(id);
    if (enabled && idx < 0) {
      enabledIds.push(id);
    } else if (!enabled && idx >= 0) {
      enabledIds.splice(idx, 1);
    }
    try {
      localStorage.setItem(`${STORAGE_KEY}-enabled`, JSON.stringify(enabledIds));
    } catch {}
  },

  isEnabled(id) {
    return this.getEnabledPluginIds().includes(id);
  },
};
