import { el } from '../utils/dom.js';
import { aiProvider } from './ai-provider.js';
import { documentStore } from '../store/document-store.js';
import { milkdown } from '../editor/milkdown-setup.js';
import { toast } from '../ui/toast.js';
import { settingsStore } from '../store/settings-store.js';
import { eventBus } from '../store/event-bus.js';

let panel = null;
let abortController = null;

function createPanel() {
  const input = el('input', {
    type: 'text',
    className: 'ai-panel-input',
    placeholder: 'Ask AI to write, edit, or generate...',
  });

  const output = el('div', { className: 'ai-panel-output' });

  const insertBtn = el('button', {
    className: 'ai-panel-btn ai-panel-insert',
    style: { display: 'none' },
    onClick: () => {
      const text = output.textContent;
      if (text) {
        const view = milkdown.getView();
        if (view) {
          const { from } = view.state.selection;
          const tr = view.state.tr.insertText(text, from);
          view.dispatch(tr);
          view.focus();
        }
        closeAiPanel();
      }
    },
  }, 'Insert');

  const closeBtn = el('button', {
    className: 'ai-panel-btn ai-panel-close',
    onClick: closeAiPanel,
  }, 'Close');

  const buttons = el('div', { className: 'ai-panel-buttons' }, insertBtn, closeBtn);

  const container = el('div', { className: 'ai-panel' },
    el('div', { className: 'ai-panel-header' }, 'AI Assistant'),
    input,
    output,
    buttons,
  );

  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && input.value.trim()) {
      e.preventDefault();
      await runPrompt(input.value.trim(), output, insertBtn);
    }
    if (e.key === 'Escape') {
      closeAiPanel();
    }
  });

  document.body.appendChild(container);
  return { container, input, output, insertBtn };
}

async function runPrompt(prompt, output, insertBtn) {
  if (abortController) abortController.abort();
  abortController = new AbortController();

  output.textContent = 'Thinking...';
  output.style.display = 'block';
  insertBtn.style.display = 'none';

  try {
    // Build context from current document
    const markdown = documentStore.getMarkdown();
    const selectedText = milkdown.getSelectedText();

    let context = `Current document:\n${markdown.slice(0, 2000)}`;
    if (selectedText) {
      context += `\n\nCurrently selected text:\n${selectedText}`;
    }

    const result = await aiProvider.prompt(
      'You are a writing assistant in a markdown editor. Help the user with their request. If they ask you to write or generate content, return well-formatted markdown. Be concise and helpful.',
      `${context}\n\nUser request: ${prompt}`,
      { signal: abortController.signal },
    );

    output.textContent = result || 'No response from AI.';
    insertBtn.style.display = result ? 'inline-block' : 'none';
  } catch (e) {
    if (e.name !== 'AbortError') {
      output.textContent = `Error: ${e.message}`;
    }
  }
}

export function openAiPanel() {
  if (!aiProvider.isAvailable()) {
    toast('AI not available. Configure an API key in the AI settings (Ctrl+K \u2192 "AI Settings")', 'warning');
    return;
  }

  if (!panel) panel = createPanel();
  panel.container.style.display = 'flex';
  panel.output.style.display = 'none';
  panel.insertBtn.style.display = 'none';
  panel.input.value = '';
  panel.input.focus();
}

export function closeAiPanel() {
  if (panel) {
    panel.container.style.display = 'none';
  }
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
}

export function isAiPanelOpen() {
  return panel?.container?.style.display !== 'none' && panel?.container?.style.display !== '';
}

export async function summarizeDocument() {
  if (!aiProvider.isAvailable()) {
    toast('AI not available', 'warning');
    return;
  }

  const markdown = documentStore.getMarkdown();
  if (!markdown || markdown.length < 50) {
    toast('Document too short to summarize', 'warning');
    return;
  }

  const dismiss = toast('Summarizing...', 'info', 30000);
  try {
    const summary = await aiProvider.summarize(markdown);
    dismiss();

    // Show summary in a modal-like panel
    if (!panel) panel = createPanel();
    panel.container.style.display = 'flex';
    panel.input.value = '';
    panel.input.placeholder = 'Ask a follow-up question...';
    panel.output.style.display = 'block';
    panel.output.textContent = summary;
    panel.insertBtn.style.display = 'inline-block';
  } catch (e) {
    dismiss();
    toast(`Summary failed: ${e.message}`, 'error');
  }
}

export async function suggestTitle() {
  if (!aiProvider.isAvailable()) {
    toast('AI not available', 'warning');
    return;
  }

  const markdown = documentStore.getMarkdown();
  if (!markdown || markdown.length < 30) {
    toast('Need more content to suggest a title', 'warning');
    return;
  }

  const dismiss = toast('Generating title suggestions...', 'info', 15000);
  try {
    const result = await aiProvider.prompt(
      'You are a title generator. Given a markdown document, suggest 3 short, compelling H1 titles. Return them as a numbered list (1. 2. 3.) with no other text.',
      markdown.slice(0, 3000),
    );
    dismiss();

    if (!panel) panel = createPanel();
    panel.container.style.display = 'flex';
    panel.input.value = '';
    panel.input.placeholder = 'Or type your own title...';
    panel.output.style.display = 'block';
    panel.output.textContent = result;
    panel.insertBtn.style.display = 'none';
  } catch (e) {
    dismiss();
    toast(`Title suggestion failed: ${e.message}`, 'error');
  }
}

// AI Settings panel
export function openAiSettings() {
  const overlay = el('div', { className: 'ai-settings-overlay' });

  const currentProvider = settingsStore.get('aiProvider') || '';
  const currentKey = settingsStore.get('aiApiKey') || '';
  const currentInline = settingsStore.get('aiInlineComplete') ?? false;

  const providerSelect = el('select', { className: 'ai-settings-select' },
    el('option', { value: '' }, 'Auto (Chrome AI or select below)'),
    el('option', { value: 'openai' }, 'OpenAI'),
    el('option', { value: 'anthropic' }, 'Anthropic'),
  );
  providerSelect.value = currentProvider;

  const keyInput = el('input', {
    type: 'password',
    className: 'ai-settings-input',
    placeholder: 'Paste your API key...',
    value: currentKey,
  });

  const inlineCheck = el('input', { type: 'checkbox' });
  inlineCheck.checked = currentInline;

  const chromeStatus = el('div', { className: 'ai-settings-chrome-status' });
  aiProvider.getChromeCapabilities().prompt
    ? (chromeStatus.textContent = 'Chrome Built-in AI: Available')
    : (chromeStatus.textContent = 'Chrome Built-in AI: Not available (requires Chrome 127+ with flags)');

  const saveBtn = el('button', {
    className: 'ai-settings-save',
    onClick: () => {
      settingsStore.set('aiProvider', providerSelect.value);
      settingsStore.set('aiApiKey', keyInput.value);
      settingsStore.set('aiInlineComplete', inlineCheck.checked);
      overlay.remove();
      toast('AI settings saved', 'success');
    },
  }, 'Save');

  const cancelBtn = el('button', {
    className: 'ai-settings-cancel',
    onClick: () => overlay.remove(),
  }, 'Cancel');

  const dialog = el('div', { className: 'ai-settings-dialog' },
    el('h3', {}, 'AI Settings'),
    chromeStatus,
    el('label', {}, 'API Provider'),
    providerSelect,
    el('label', {}, 'API Key'),
    keyInput,
    el('p', { className: 'ai-settings-hint' }, 'For non-Chrome browsers. Key is stored locally in your browser.'),
    el('label', { className: 'ai-settings-checkbox-label' },
      inlineCheck,
      ' Enable inline autocomplete (ghost text)',
    ),
    el('div', { className: 'ai-settings-actions' }, cancelBtn, saveBtn),
  );

  overlay.appendChild(dialog);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
}
