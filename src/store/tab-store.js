import { eventBus } from './event-bus.js';
import { documentStore } from './document-store.js';

/**
 * Tab store — manages open document tabs.
 * Each tab stores: { id, name, content, source, dirty, cursorOffset }
 */

let tabs = [];
let activeTabId = null;

export const tabStore = {
  getTabs() {
    return tabs;
  },

  getActiveTabId() {
    return activeTabId;
  },

  getActiveTab() {
    return tabs.find(t => t.id === activeTabId) || null;
  },

  /** Open or switch to a tab. If not found, creates one. */
  openTab(id, name, content, source) {
    // Save current tab state before switching
    this._saveCurrentTab();

    let tab = tabs.find(t => t.id === id);
    if (tab) {
      // Already open — just switch
      activeTabId = tab.id;
      // Update content if provided fresh
      if (content !== undefined) {
        tab.content = content;
        tab.name = name || tab.name;
        tab.source = source || tab.source;
        tab.dirty = false;
      }
    } else {
      tab = { id, name, content: content || '', source: source || null, dirty: false, cursorOffset: 0 };
      tabs.push(tab);
      activeTabId = tab.id;
    }

    eventBus.emit('tabs:changed', { tabs, activeTabId });
    return tab;
  },

  /** Close a tab. Returns the next tab to activate, or null. */
  closeTab(id) {
    const idx = tabs.findIndex(t => t.id === id);
    if (idx === -1) return null;

    tabs.splice(idx, 1);

    if (activeTabId === id) {
      // Switch to adjacent tab
      const next = tabs[Math.min(idx, tabs.length - 1)];
      activeTabId = next?.id || null;
      if (next) {
        eventBus.emit('tabs:changed', { tabs, activeTabId });
        return next;
      }
    }

    eventBus.emit('tabs:changed', { tabs, activeTabId });
    return this.getActiveTab();
  },

  /** Switch to a tab by id */
  switchTab(id) {
    if (id === activeTabId) return;
    this._saveCurrentTab();
    const tab = tabs.find(t => t.id === id);
    if (!tab) return;
    activeTabId = id;
    eventBus.emit('tabs:changed', { tabs, activeTabId });
    return tab;
  },

  /** Mark the active tab as dirty */
  markDirty() {
    const tab = this.getActiveTab();
    if (tab) tab.dirty = true;
    eventBus.emit('tabs:changed', { tabs, activeTabId });
  },

  /** Mark a tab as saved */
  markSaved(id) {
    const tab = tabs.find(t => t.id === (id || activeTabId));
    if (tab) {
      tab.dirty = false;
      tab.content = documentStore.getMarkdown();
    }
    eventBus.emit('tabs:changed', { tabs, activeTabId });
  },

  /** Update active tab name (after rename) */
  updateName(id, name) {
    const tab = tabs.find(t => t.id === id);
    if (tab) tab.name = name;
    eventBus.emit('tabs:changed', { tabs, activeTabId });
  },

  /** Reorder tabs via drag */
  reorder(fromIdx, toIdx) {
    const [moved] = tabs.splice(fromIdx, 1);
    tabs.splice(toIdx, 0, moved);
    eventBus.emit('tabs:changed', { tabs, activeTabId });
  },

  /** Save current tab's content state from documentStore */
  _saveCurrentTab() {
    const tab = this.getActiveTab();
    if (tab) {
      tab.content = documentStore.getMarkdown();
      tab.name = documentStore.getFileName();
      tab.dirty = documentStore.isDirty();
    }
  },
};
