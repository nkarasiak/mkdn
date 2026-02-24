import { commandRegistry } from '../command-palette/command-registry.js';
import { openAiPanel, closeAiPanel, summarizeDocument, suggestTitle, openAiSettings } from './ai-panel.js';
import { aiProvider } from './ai-provider.js';
import { initAiActions } from './ai-actions.js';

export function registerAiCommands() {
  // Initialize AI provider
  aiProvider.init();

  // Initialize selection-based AI actions
  initAiActions();

  commandRegistry.registerMany([
    {
      id: 'ai:prompt',
      label: 'AI: Ask AI',
      category: 'AI',
      shortcut: 'Ctrl+Space',
      keywords: ['ai', 'generate', 'write', 'assistant', 'prompt', 'gpt', 'claude'],
      action: openAiPanel,
    },
    {
      id: 'ai:summarize',
      label: 'AI: Summarize Document',
      category: 'AI',
      keywords: ['ai', 'summarize', 'summary', 'tldr'],
      action: summarizeDocument,
    },
    {
      id: 'ai:suggest-title',
      label: 'AI: Suggest Title',
      category: 'AI',
      keywords: ['ai', 'title', 'heading', 'h1', 'suggest', 'name'],
      action: suggestTitle,
    },
    {
      id: 'ai:settings',
      label: 'AI: Settings',
      category: 'AI',
      keywords: ['ai', 'settings', 'api', 'key', 'openai', 'anthropic', 'chrome'],
      action: openAiSettings,
    },
  ]);
}
