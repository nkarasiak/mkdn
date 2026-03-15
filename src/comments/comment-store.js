import { eventBus } from '../store/event-bus.js';

const STORAGE_KEY = 'mkdn-comments';

/**
 * In-memory + localStorage comment store.
 * Comments are keyed by fileId and contain a list of threads.
 * Each thread has: id, from, to, text (the highlighted text), comments[], resolved.
 * Each comment has: id, author, text, timestamp.
 */

let comments = {};

function load() {
  try {
    comments = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch { comments = {}; }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(comments));
  } catch { /* quota */ }
}

function generateId() {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

load();

export const commentStore = {
  /** Get all threads for a file. */
  getThreads(fileId) {
    return comments[fileId] || [];
  },

  /** Add a new comment thread on selected text. */
  addThread(fileId, { from, to, text, commentText, author = 'You' }) {
    if (!comments[fileId]) comments[fileId] = [];
    const thread = {
      id: generateId(),
      from,
      to,
      text, // the selected/highlighted text
      resolved: false,
      comments: [{
        id: generateId(),
        author,
        text: commentText,
        timestamp: Date.now(),
      }],
    };
    comments[fileId].push(thread);
    save();
    eventBus.emit('comments:updated', { fileId });
    return thread;
  },

  /** Add a reply to an existing thread. */
  addReply(fileId, threadId, { text, author = 'You' }) {
    const threads = comments[fileId];
    if (!threads) return;
    const thread = threads.find(t => t.id === threadId);
    if (!thread) return;
    thread.comments.push({
      id: generateId(),
      author,
      text,
      timestamp: Date.now(),
    });
    save();
    eventBus.emit('comments:updated', { fileId });
  },

  /** Resolve a thread. */
  resolveThread(fileId, threadId) {
    const threads = comments[fileId];
    if (!threads) return;
    const thread = threads.find(t => t.id === threadId);
    if (thread) {
      thread.resolved = true;
      save();
      eventBus.emit('comments:updated', { fileId });
    }
  },

  /** Delete a thread. */
  deleteThread(fileId, threadId) {
    if (!comments[fileId]) return;
    comments[fileId] = comments[fileId].filter(t => t.id !== threadId);
    save();
    eventBus.emit('comments:updated', { fileId });
  },

  /** Get count of unresolved threads for a file. */
  getUnresolvedCount(fileId) {
    return (comments[fileId] || []).filter(t => !t.resolved).length;
  },
};
