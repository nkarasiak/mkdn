import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import { el, injectStyles } from '../utils/dom.js';
import { commentStore } from './comment-store.js';
import { documentStore } from '../store/document-store.js';
import { eventBus } from '../store/event-bus.js';

const commentPluginKey = new PluginKey('comments');

injectStyles(`
  .comment-highlight {
    background: color-mix(in srgb, var(--warning) 20%, transparent);
    border-bottom: 2px solid var(--warning);
    cursor: pointer;
    position: relative;
  }

  .comment-highlight:hover {
    background: color-mix(in srgb, var(--warning) 30%, transparent);
  }

  .comment-popover {
    position: fixed;
    width: 280px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    z-index: 300;
    padding: 12px;
    display: none;
  }

  .comment-popover.open {
    display: block;
  }

  .comment-thread-text {
    font-family: var(--font-sans);
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    font-style: italic;
    padding: 6px 8px;
    background: var(--bg-secondary);
    border-radius: var(--radius-sm);
    margin-bottom: 8px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .comment-entry {
    margin-bottom: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border-light);
  }

  .comment-entry:last-of-type {
    border-bottom: none;
  }

  .comment-author {
    font-family: var(--font-sans);
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .comment-time {
    font-family: var(--font-sans);
    font-size: 10px;
    color: var(--text-muted);
    margin-left: 6px;
  }

  .comment-text {
    font-family: var(--font-sans);
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    margin-top: 2px;
    line-height: 1.4;
  }

  .comment-reply-input {
    width: 100%;
    padding: 6px 8px;
    font-family: var(--font-sans);
    font-size: var(--font-size-sm);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-primary);
    color: var(--text-primary);
    outline: none;
    resize: none;
    margin-top: 8px;
    box-sizing: border-box;
  }

  .comment-reply-input:focus {
    border-color: var(--accent);
  }

  .comment-actions {
    display: flex;
    gap: 6px;
    margin-top: 8px;
    justify-content: flex-end;
  }

  .comment-action-btn {
    padding: 3px 10px;
    font-family: var(--font-sans);
    font-size: var(--font-size-xs);
    font-weight: 500;
    border-radius: var(--radius-sm);
    cursor: pointer;
    border: none;
    transition: background 0.1s ease;
  }

  .comment-resolve-btn {
    background: var(--success);
    color: white;
  }
  .comment-resolve-btn:hover { opacity: 0.9; }

  .comment-delete-btn {
    background: var(--bg-tertiary);
    color: var(--text-secondary);
  }
  .comment-delete-btn:hover { background: var(--bg-active); }

  .comment-reply-btn {
    background: var(--accent);
    color: var(--accent-text);
  }
  .comment-reply-btn:hover { opacity: 0.9; }
`);

let popoverEl = null;
let currentThreadId = null;

function getPopover() {
  if (popoverEl) return popoverEl;
  popoverEl = el('div', { className: 'comment-popover' });
  document.body.appendChild(popoverEl);
  return popoverEl;
}

function showThreadPopover(thread, anchorRect) {
  const pop = getPopover();
  currentThreadId = thread.id;
  pop.replaceChildren();

  // Quoted text
  pop.appendChild(el('div', { className: 'comment-thread-text' }, `\u201C${thread.text}\u201D`));

  // Comments
  thread.comments.forEach(c => {
    const time = new Date(c.timestamp).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
    pop.appendChild(el('div', { className: 'comment-entry' },
      el('div', {},
        el('span', { className: 'comment-author' }, c.author),
        el('span', { className: 'comment-time' }, time),
      ),
      el('div', { className: 'comment-text' }, c.text),
    ));
  });

  // Reply input
  const replyInput = el('textarea', {
    className: 'comment-reply-input',
    placeholder: 'Reply...',
    rows: '2',
  });
  pop.appendChild(replyInput);

  // Actions
  const fileId = documentStore.getFileId() || documentStore.getFileName();
  pop.appendChild(el('div', { className: 'comment-actions' },
    el('button', {
      className: 'comment-action-btn comment-delete-btn',
      onClick: () => {
        commentStore.deleteThread(fileId, thread.id);
        hidePopover();
      },
    }, 'Delete'),
    el('button', {
      className: 'comment-action-btn comment-resolve-btn',
      onClick: () => {
        commentStore.resolveThread(fileId, thread.id);
        hidePopover();
      },
    }, 'Resolve'),
    el('button', {
      className: 'comment-action-btn comment-reply-btn',
      onClick: () => {
        const text = replyInput.value.trim();
        if (text) {
          commentStore.addReply(fileId, thread.id, { text });
          showThreadPopover(
            commentStore.getThreads(fileId).find(t => t.id === thread.id),
            anchorRect
          );
        }
      },
    }, 'Reply'),
  ));

  // Position
  pop.style.left = `${anchorRect.right + 8}px`;
  pop.style.top = `${anchorRect.top}px`;
  pop.classList.add('open');

  requestAnimationFrame(() => {
    const rect = pop.getBoundingClientRect();
    if (rect.right > window.innerWidth - 8) {
      pop.style.left = `${anchorRect.left - rect.width - 8}px`;
    }
    if (rect.bottom > window.innerHeight - 8) {
      pop.style.top = `${window.innerHeight - rect.height - 8}px`;
    }
    replyInput.focus();
  });
}

function hidePopover() {
  if (popoverEl) {
    popoverEl.classList.remove('open');
    currentThreadId = null;
  }
}

// Close popover on outside click
document.addEventListener('mousedown', (e) => {
  if (popoverEl && !popoverEl.contains(e.target) && !e.target.closest('.comment-highlight')) {
    hidePopover();
  }
});

/**
 * Add a comment on the current selection.
 * Must be called after milkdown is initialized.
 */
export async function addComment() {
  const { milkdown } = await import('../editor/milkdown-setup.js');
  const pmView = milkdown.getView();
  if (!pmView) return;

  const { from, to } = pmView.state.selection;
  if (from === to) return; // No selection

  const selectedText = pmView.state.doc.textBetween(from, to);
  const commentText = prompt('Add a comment:');
  if (!commentText?.trim()) return;

  const fileId = documentStore.getFileId() || documentStore.getFileName();
  commentStore.addThread(fileId, {
    from,
    to,
    text: selectedText,
    commentText: commentText.trim(),
  });
}

/**
 * Create ProseMirror plugin for comment decorations.
 */
export function createCommentPlugin() {
  return new Plugin({
    key: commentPluginKey,

    state: {
      init() { return DecorationSet.empty; },
      apply(tr, oldSet, oldState, newState) {
        const fileId = documentStore.getFileId() || documentStore.getFileName();
        const threads = commentStore.getThreads(fileId).filter(t => !t.resolved);

        if (threads.length === 0) return DecorationSet.empty;

        const decorations = [];
        const docSize = newState.doc.content.size;

        threads.forEach(thread => {
          const from = Math.min(thread.from, docSize);
          const to = Math.min(thread.to, docSize);
          if (from >= to || from < 0) return;

          try {
            decorations.push(
              Decoration.inline(from, to, {
                class: 'comment-highlight',
                'data-thread-id': thread.id,
              })
            );
          } catch { /* positions may be invalid after edits */ }
        });

        return DecorationSet.create(newState.doc, decorations);
      },
    },

    props: {
      decorations(state) {
        return this.getState(state);
      },

      handleClick(view, pos, event) {
        const target = event.target;
        if (!target.closest('.comment-highlight')) return false;

        const threadId = target.closest('.comment-highlight')?.dataset?.threadId;
        if (!threadId) return false;

        const fileId = documentStore.getFileId() || documentStore.getFileName();
        const thread = commentStore.getThreads(fileId).find(t => t.id === threadId);
        if (!thread) return false;

        const rect = target.getBoundingClientRect();
        showThreadPopover(thread, rect);
        return true;
      },
    },
  });
}
