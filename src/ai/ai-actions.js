import { el } from '../utils/dom.js';
import { aiProvider } from './ai-provider.js';
import { milkdown } from '../editor/milkdown-setup.js';
import { documentStore } from '../store/document-store.js';
import { toast } from '../ui/toast.js';

let actionBar = null;
let activeAbort = null;

const actions = [
  { id: 'rewrite', label: 'Rewrite', icon: '\u21BB', instruction: 'Rewrite this text to be clearer and more concise while keeping the same meaning.' },
  { id: 'shorten', label: 'Shorten', icon: '\u2296', instruction: 'Make this text shorter while preserving the key points.' },
  { id: 'expand', label: 'Expand', icon: '\u2295', instruction: 'Expand this text with more detail and explanation.' },
  { id: 'fix-grammar', label: 'Fix Grammar', icon: '\u2713', instruction: 'Fix any grammar, spelling, or punctuation errors in this text. Keep the original style.' },
  { id: 'formal', label: 'Formal', icon: 'F', instruction: 'Rewrite this text in a more formal, professional tone.' },
  { id: 'casual', label: 'Casual', icon: 'C', instruction: 'Rewrite this text in a more casual, conversational tone.' },
];

function createActionBar() {
  const bar = el('div', { className: 'ai-action-bar' });

  for (const action of actions) {
    const btn = el('button', {
      className: 'ai-action-btn',
      title: action.label,
      onClick: () => executeAction(action),
    }, action.label);
    bar.appendChild(btn);
  }

  // Translate dropdown
  const translateBtn = el('button', {
    className: 'ai-action-btn ai-action-translate',
    title: 'Translate',
    onClick: () => showTranslateMenu(translateBtn),
  }, 'Translate');
  bar.appendChild(translateBtn);

  document.body.appendChild(bar);
  return bar;
}

function showTranslateMenu(anchor) {
  const existing = document.querySelector('.ai-translate-menu');
  if (existing) { existing.remove(); return; }

  const languages = ['Spanish', 'French', 'German', 'Portuguese', 'Italian', 'Chinese', 'Japanese', 'Korean', 'Russian', 'Arabic'];
  const menu = el('div', { className: 'ai-translate-menu' });

  for (const lang of languages) {
    menu.appendChild(el('button', {
      className: 'ai-translate-item',
      onClick: () => {
        menu.remove();
        executeAction({
          id: `translate-${lang.toLowerCase()}`,
          label: `Translate to ${lang}`,
          instruction: `Translate this text to ${lang}. Return only the translated text.`,
        });
      },
    }, lang));
  }

  const rect = anchor.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.left = `${rect.left}px`;
  menu.style.top = `${rect.bottom + 4}px`;
  document.body.appendChild(menu);

  const close = (e) => {
    if (!menu.contains(e.target) && e.target !== anchor) {
      menu.remove();
      document.removeEventListener('click', close);
    }
  };
  setTimeout(() => document.addEventListener('click', close), 0);
}

async function executeAction(action) {
  const selectedText = milkdown.getSelectedText();
  if (!selectedText) {
    toast('Select some text first', 'warning');
    return;
  }

  hideActionBar();

  if (activeAbort) activeAbort.abort();
  activeAbort = new AbortController();

  const loadingToast = toast('AI is working...', 'info', 30000);

  try {
    const result = await aiProvider.rewrite(selectedText, action.instruction, {
      signal: activeAbort.signal,
    });

    loadingToast();

    if (result) {
      // Replace the selected text in the editor
      const view = milkdown.getView();
      if (view) {
        const { from, to } = view.state.selection;
        const tr = view.state.tr.replaceWith(from, to, view.state.schema.text(result));
        view.dispatch(tr);
        toast('Text updated', 'success', 2000);
      }
    }
  } catch (e) {
    loadingToast();
    if (e.name !== 'AbortError') {
      toast(`AI error: ${e.message}`, 'error');
    }
  }
}

export function showActionBar(coords) {
  if (!aiProvider.isAvailable()) return;

  if (!actionBar) actionBar = createActionBar();

  actionBar.style.display = 'flex';
  actionBar.style.left = `${coords.left}px`;
  actionBar.style.top = `${coords.top - 44}px`;

  // Keep in viewport
  requestAnimationFrame(() => {
    const rect = actionBar.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      actionBar.style.left = `${window.innerWidth - rect.width - 8}px`;
    }
    if (rect.top < 0) {
      actionBar.style.top = `${coords.bottom + 4}px`;
    }
  });
}

export function hideActionBar() {
  if (actionBar) actionBar.style.display = 'none';
  const menu = document.querySelector('.ai-translate-menu');
  if (menu) menu.remove();
}

// Show AI action bar on text selection (with debounce)
let selectionTimer = null;

export function initAiActions() {
  document.addEventListener('mouseup', () => {
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(() => {
      const selectedText = milkdown.getSelectedText();
      if (selectedText && selectedText.length > 3 && aiProvider.isAvailable()) {
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          showActionBar({ left: rect.left, top: rect.top, bottom: rect.bottom });
        }
      } else {
        hideActionBar();
      }
    }, 300);
  });

  // Hide on click away or scroll
  document.addEventListener('mousedown', (e) => {
    if (actionBar && !actionBar.contains(e.target)) {
      hideActionBar();
    }
  });

  document.addEventListener('scroll', () => hideActionBar(), true);
}
