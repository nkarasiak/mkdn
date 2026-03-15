/**
 * Canvas data model and persistence.
 * Stores/loads whiteboard canvases to/from localStorage.
 */

import { debounce } from '../utils/debounce.js';

const STORAGE_PREFIX = 'mkdn-canvas-';

let _nextId = 1;

export function generateId() {
  return `n${Date.now().toString(36)}-${(_nextId++).toString(36)}`;
}

/** Create a blank canvas data structure. */
export function createCanvasData() {
  return {
    version: 1,
    name: 'Untitled Canvas',
    nodes: [],
    edges: [],
  };
}

/** Create a new card node. */
export function createCard(x, y) {
  return {
    id: generateId(),
    type: 'card',
    x,
    y,
    width: 200,
    height: 120,
    title: 'New Card',
    content: '',
    color: '#ffffff',
    linkedFile: null,
  };
}

/** Create a new text label node. */
export function createTextLabel(x, y) {
  return {
    id: generateId(),
    type: 'text',
    x,
    y,
    text: 'Text',
    fontSize: 16,
  };
}

/** Create an edge between two nodes. */
export function createEdge(fromId, toId) {
  return {
    id: generateId(),
    from: fromId,
    to: toId,
    label: '',
    color: '#888888',
  };
}

/** List all saved canvas names. */
export function listCanvases() {
  const names = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith(STORAGE_PREFIX)) {
      names.push(key.slice(STORAGE_PREFIX.length));
    }
  }
  return names.sort();
}

/** Save canvas data to localStorage. */
export function saveCanvas(name, data) {
  data.name = name;
  localStorage.setItem(STORAGE_PREFIX + name, JSON.stringify(data));
}

/** Load canvas data from localStorage. */
export function loadCanvas(name) {
  const raw = localStorage.getItem(STORAGE_PREFIX + name);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Delete a canvas from localStorage. */
export function deleteCanvas(name) {
  localStorage.removeItem(STORAGE_PREFIX + name);
}

/** Export canvas data as JSON string. */
export function exportCanvas(name) {
  const data = loadCanvas(name);
  return data ? JSON.stringify(data, null, 2) : null;
}

/** Import canvas data from JSON string. Returns the parsed data or null. */
export function importCanvas(json) {
  try {
    const data = JSON.parse(json);
    if (data && data.version && Array.isArray(data.nodes) && Array.isArray(data.edges)) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

/** Create a debounced auto-save function for a named canvas. */
export function createAutoSave(getName, getData) {
  return debounce(() => {
    const name = getName();
    const data = getData();
    if (name && data) {
      saveCanvas(name, data);
    }
  }, 1000);
}
