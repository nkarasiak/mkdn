const commands = [];

export const commandRegistry = {
  register(cmd) {
    // Avoid duplicates
    if (!commands.find(c => c.id === cmd.id)) {
      commands.push(cmd);
    }
  },

  registerMany(cmds) {
    for (const cmd of cmds) this.register(cmd);
  },

  getAll() {
    return commands;
  },

  getById(id) {
    return commands.find(c => c.id === id) ?? null;
  },

  execute(id) {
    const cmd = this.getById(id);
    if (cmd?.action) cmd.action();
  },
};

/**
 * Register all built-in commands from existing app functionality.
 */
export function registerBuiltinCommands({ toggleSidebar, toggleHistory, milkdown, fileSaver, localSync, documentStore, focusManager }) {
  commandRegistry.registerMany([
    // --- File ---
    { id: 'file:save', label: 'Save', category: 'File', shortcut: 'Ctrl+S', keywords: ['save', 'write'], action: () => fileSaver.save() },
    { id: 'file:save-as', label: 'Save As', category: 'File', shortcut: 'Ctrl+Shift+S', keywords: ['save as', 'export'], action: () => fileSaver.saveAs() },
    { id: 'file:new', label: 'New Document', category: 'File', shortcut: 'Ctrl+N', keywords: ['new', 'create', 'blank'], action: () => documentStore.newDocument() },
    { id: 'file:open', label: 'Open File', category: 'File', shortcut: 'Ctrl+O', keywords: ['open', 'load'], action: () => fileSaver.openFile() },
    { id: 'file:open-folder', label: 'Open Folder', category: 'File', keywords: ['folder', 'directory', 'link'], action: () => localSync.linkFolder() },

    // --- View ---
    { id: 'view:toggle-sidebar', label: 'Toggle Sidebar', category: 'View', shortcut: 'Ctrl+Shift+B', keywords: ['sidebar', 'panel'], action: toggleSidebar },
    { id: 'view:toggle-history', label: 'Toggle History', category: 'View', shortcut: 'Ctrl+Shift+H', keywords: ['history', 'versions'], action: toggleHistory },

    // --- Format ---
    { id: 'format:bold', label: 'Bold', category: 'Format', shortcut: 'Ctrl+B', keywords: ['bold', 'strong'], action: () => milkdown.runCommand(milkdown.commands.toggleBold) },
    { id: 'format:italic', label: 'Italic', category: 'Format', shortcut: 'Ctrl+I', keywords: ['italic', 'emphasis'], action: () => milkdown.runCommand(milkdown.commands.toggleItalic) },
    { id: 'format:strikethrough', label: 'Strikethrough', category: 'Format', keywords: ['strikethrough', 'strike'], action: () => milkdown.runCommand(milkdown.commands.toggleStrikethrough) },
    { id: 'format:code', label: 'Inline Code', category: 'Format', keywords: ['code', 'inline', 'monospace'], action: () => milkdown.runCommand(milkdown.commands.toggleCode) },
    { id: 'format:h1', label: 'Heading 1', category: 'Format', keywords: ['heading', 'h1', 'title'], action: () => milkdown.runCommand(milkdown.commands.wrapHeading, 1) },
    { id: 'format:h2', label: 'Heading 2', category: 'Format', keywords: ['heading', 'h2', 'subtitle'], action: () => milkdown.runCommand(milkdown.commands.wrapHeading, 2) },
    { id: 'format:h3', label: 'Heading 3', category: 'Format', keywords: ['heading', 'h3'], action: () => milkdown.runCommand(milkdown.commands.wrapHeading, 3) },
    { id: 'format:normal', label: 'Normal Text', category: 'Format', keywords: ['paragraph', 'normal', 'plain', 'text'], action: () => milkdown.runCommand(milkdown.commands.turnIntoText) },
    { id: 'format:bullet-list', label: 'Bullet List', category: 'Format', keywords: ['bullet', 'unordered', 'list'], action: () => milkdown.toggleList('bullet_list', milkdown.commands.wrapBulletList) },
    { id: 'format:ordered-list', label: 'Ordered List', category: 'Format', keywords: ['ordered', 'numbered', 'list'], action: () => milkdown.toggleList('ordered_list', milkdown.commands.wrapOrderedList) },
    { id: 'format:blockquote', label: 'Blockquote', category: 'Format', keywords: ['quote', 'blockquote'], action: () => milkdown.toggleBlockquote() },

    // --- Insert ---
    { id: 'insert:link', label: 'Insert Link', category: 'Insert', shortcut: 'Ctrl+L', keywords: ['link', 'url', 'href'], action: () => milkdown.runCommand(milkdown.commands.toggleLink) },
    { id: 'insert:hr', label: 'Horizontal Rule', category: 'Insert', keywords: ['horizontal', 'rule', 'divider', 'separator'], action: () => milkdown.runCommand(milkdown.commands.insertHr) },
    { id: 'insert:code-block', label: 'Code Block', category: 'Insert', keywords: ['code', 'block', 'snippet'], action: () => milkdown.runCommand(milkdown.commands.createCodeBlock) },

    // --- Edit ---
    { id: 'edit:undo', label: 'Undo', category: 'Edit', shortcut: 'Ctrl+Z', keywords: ['undo', 'revert'], action: () => milkdown.runCommand(milkdown.commands.undo) },
    { id: 'edit:redo', label: 'Redo', category: 'Edit', shortcut: 'Ctrl+Shift+Z', keywords: ['redo'], action: () => milkdown.runCommand(milkdown.commands.redo) },

    // --- Export ---
    { id: 'export:download-md', label: 'Download .md', category: 'Export', keywords: ['download', 'markdown', 'save', 'export'], action: () => {
      import('../utils/export.js').then(m => m.downloadMarkdown());
    }},
    { id: 'export:copy-html', label: 'Copy as HTML', category: 'Export', keywords: ['copy', 'html', 'clipboard'], action: () => {
      import('../utils/export.js').then(m => m.copyHtml());
    }},

    // --- Focus ---
    { id: 'focus:zen', label: 'Zen Mode', category: 'Focus', shortcut: 'Ctrl+Shift+F', keywords: ['zen', 'distraction', 'free', 'focus', 'fullscreen'], action: () => focusManager.cycleMode() },
    { id: 'focus:paragraph', label: 'Paragraph Focus', category: 'Focus', keywords: ['paragraph', 'focus', 'dim'], action: () => {
      settingsStore.set('paragraphFocus', !settingsStore.get('paragraphFocus'));
    }},
    { id: 'focus:typewriter', label: 'Typewriter Mode', category: 'Focus', keywords: ['typewriter', 'scroll', 'center'], action: () => {
      settingsStore.set('typewriterMode', !settingsStore.get('typewriterMode'));
    }},
  ]);
}

// Re-export settingsStore for the inline actions above
import { settingsStore } from '../store/settings-store.js';
