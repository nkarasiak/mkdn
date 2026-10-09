import { eventBus } from './event-bus.js';
import { documentStore } from './document-store.js';

/**
 * Tab store — manages open document tabs.
 * Each tab stores: { id, name, content, source, dirty, mtime }
 */

let tabs = [];
let activeTabId = null;
let closedTabs = []; // stack for reopen (Ctrl+Shift+T), max 20

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

  /**
   * Sync the tab for `id` with documentStore (called on file:opened / file:new).
   * Creates the tab if missing, then makes it active.
   */
  openTab(id, name, content, source) {
    let tab = tabs.find(t => t.id === id);
    if (!tab) {
      tab = { id };
      tabs.push(tab);
    }
    Object.assign(tab, {
      name,
      content: content || '',
      source: source || null,
      dirty: documentStore.isDirty(),
      mtime: documentStore.getLastModifiedOnDisk(),
    });
    activeTabId = id;
    eventBus.emit('tabs:changed', { tabs, activeTabId });
    return tab;
  },

  /** Close a tab, activating a neighbour if it was active. Never closes the last tab. */
  closeTab(id) {
    const idx = tabs.findIndex(t => t.id === id);
    if (idx === -1 || tabs.length <= 1) return null;
    if (id === activeTabId) this.switchTab((tabs[idx + 1] || tabs[idx - 1]).id);

    const [closed] = tabs.splice(tabs.findIndex(t => t.id === id), 1);
    closedTabs.push(closed);
    if (closedTabs.length > 20) closedTabs.shift();

    eventBus.emit('tabs:changed', { tabs, activeTabId });
    return this.getActiveTab();
  },

  /** Switch to a tab by id, loading it into the editor. Returns the tab, or null. */
  switchTab(id) {
    const tab = tabs.find(t => t.id === id);
    if (!tab) return null;
    if (id === activeTabId) return tab;
    const current = this.getActiveTab();
    if (current) current.mtime = documentStore.getLastModifiedOnDisk();
    // Flushes pending edits into the current tab, then file:opened → openTab() activates this one
    documentStore.setFile(tab.id, tab.name, tab.content, tab.source, tab.mtime ?? null, tab.dirty);
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
      if (tab.id === activeTabId) tab.mtime = documentStore.getLastModifiedOnDisk();
    }
    eventBus.emit('tabs:changed', { tabs, activeTabId });
  },

  /** Update active tab name (after rename) */
  updateName(id, name) {
    const tab = tabs.find(t => t.id === id);
    if (tab) tab.name = name;
    eventBus.emit('tabs:changed', { tabs, activeTabId });
  },

  /** Reopen the last closed tab. Returns the tab, or null. */
  reopenTab() {
    const tab = closedTabs.pop();
    if (!tab) return null;
    if (!tabs.some(t => t.id === tab.id)) tabs.push(tab);
    return this.switchTab(tab.id);
  },

  /** Re-key a tab after Save As / rename so it keeps pointing at the right file. */
  rekey(oldId, newId, name) {
    const tab = tabs.find(t => t.id === oldId);
    if (!tab || oldId === newId) return;
    tabs = tabs.filter(t => t === tab || t.id !== newId); // drop a stale tab for the target file
    tab.id = newId;
    if (name) tab.name = name;
    if (activeTabId === oldId) activeTabId = newId;
    eventBus.emit('tabs:changed', { tabs, activeTabId });
  },

  /** Switch to the next tab (wraps around) */
  nextTab() {
    if (tabs.length <= 1) return null;
    const idx = tabs.findIndex(t => t.id === activeTabId);
    const next = tabs[(idx + 1) % tabs.length];
    return this.switchTab(next.id);
  },

  /** Switch to the previous tab (wraps around) */
  prevTab() {
    if (tabs.length <= 1) return null;
    const idx = tabs.findIndex(t => t.id === activeTabId);
    const prev = tabs[(idx - 1 + tabs.length) % tabs.length];
    return this.switchTab(prev.id);
  },

  /** Reorder tabs via drag */
  reorder(fromIdx, toIdx) {
    const [moved] = tabs.splice(fromIdx, 1);
    tabs.splice(toIdx, 0, moved);
    eventBus.emit('tabs:changed', { tabs, activeTabId });
  },

  persist() {
    try {
      localStorage.setItem('mkdn-tabs', JSON.stringify({ tabs, activeTabId }));
    } catch { /* quota */ }
  },

  loadPersistedTabs() {
    try {
      const raw = localStorage.getItem('mkdn-tabs');
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!Array.isArray(data?.tabs) || data.tabs.length === 0) return null;
      return data;
    } catch { return null; }
  },

  restoreTabs(savedTabs, savedActiveTabId) {
    tabs = savedTabs;
    activeTabId = savedActiveTabId || savedTabs[0]?.id || null;
  },
};
