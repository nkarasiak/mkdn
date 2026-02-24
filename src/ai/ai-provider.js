import { settingsStore } from '../store/settings-store.js';

// Detect Chrome Built-in AI availability
async function detectChromeAI() {
  const capabilities = {};
  try {
    if (window.ai?.languageModel) {
      const cap = await window.ai.languageModel.capabilities();
      capabilities.prompt = cap.available === 'readily' || cap.available === 'after-download';
    }
  } catch {}
  try {
    if (window.ai?.writer) {
      const cap = await window.ai.writer.capabilities();
      capabilities.writer = cap.available === 'readily' || cap.available === 'after-download';
    }
  } catch {}
  try {
    if (window.ai?.rewriter) {
      const cap = await window.ai.rewriter.capabilities();
      capabilities.rewriter = cap.available === 'readily' || cap.available === 'after-download';
    }
  } catch {}
  try {
    if (window.ai?.summarizer) {
      const cap = await window.ai.summarizer.capabilities();
      capabilities.summarizer = cap.available === 'readily' || cap.available === 'after-download';
    }
  } catch {}
  return capabilities;
}

let chromeAICapabilities = null;
let chromeSession = null;

export const aiProvider = {
  async init() {
    chromeAICapabilities = await detectChromeAI();
  },

  isAvailable() {
    if (chromeAICapabilities && Object.values(chromeAICapabilities).some(Boolean)) return true;
    const provider = settingsStore.get('aiProvider');
    const key = settingsStore.get('aiApiKey');
    return !!(provider && key);
  },

  getChromeCapabilities() {
    return chromeAICapabilities || {};
  },

  // Generic prompt completion - for inline complete, generate from prompt, title suggestions
  async prompt(systemPrompt, userPrompt, { stream = false, signal } = {}) {
    const caps = chromeAICapabilities || {};

    // Try Chrome Built-in AI first
    if (caps.prompt) {
      try {
        if (!chromeSession) {
          chromeSession = await window.ai.languageModel.create({
            systemPrompt: 'You are a helpful writing assistant for a markdown editor. Be concise.'
          });
        }
        if (stream) {
          return chromeSession.promptStreaming(userPrompt, { signal });
        }
        return await chromeSession.prompt(userPrompt, { signal });
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        // Fall through to API providers
      }
    }

    // Fallback to API providers
    return this._apiCall(systemPrompt, userPrompt, { stream, signal });
  },

  // Rewrite text with a specific instruction
  async rewrite(text, instruction, { signal } = {}) {
    const caps = chromeAICapabilities || {};

    if (caps.rewriter) {
      try {
        const rewriter = await window.ai.rewriter.create({
          sharedContext: instruction,
        });
        const result = await rewriter.rewrite(text, { signal });
        rewriter.destroy();
        return result;
      } catch (e) {
        if (e.name === 'AbortError') throw e;
      }
    }

    return this._apiCall(
      'You are a writing assistant. Rewrite the given text according to the instruction. Return ONLY the rewritten text, nothing else.',
      `Instruction: ${instruction}\n\nText:\n${text}`,
      { signal }
    );
  },

  // Summarize text
  async summarize(text, { type = 'tl;dr', signal } = {}) {
    const caps = chromeAICapabilities || {};

    if (caps.summarizer) {
      try {
        const summarizer = await window.ai.summarizer.create({ type: 'tl;dr' });
        const result = await summarizer.summarize(text, { signal });
        summarizer.destroy();
        return result;
      } catch (e) {
        if (e.name === 'AbortError') throw e;
      }
    }

    return this._apiCall(
      'Summarize the following markdown document concisely. Return a brief summary.',
      text,
      { signal }
    );
  },

  async _apiCall(systemPrompt, userPrompt, { stream = false, signal } = {}) {
    const provider = settingsStore.get('aiProvider') || 'openai';
    const key = settingsStore.get('aiApiKey');

    if (!key) throw new Error('No AI API key configured. Go to Settings to add one.');

    if (provider === 'openai') {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          stream,
          max_tokens: 2048,
        }),
        signal,
      });
      if (!resp.ok) throw new Error(`OpenAI API error: ${resp.status}`);

      if (stream) {
        return this._readOpenAIStream(resp.body);
      }
      const data = await resp.json();
      return data.choices[0].message.content;
    }

    if (provider === 'anthropic') {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
        signal,
      });
      if (!resp.ok) throw new Error(`Anthropic API error: ${resp.status}`);
      const data = await resp.json();
      return data.content[0].text;
    }

    throw new Error(`Unknown AI provider: ${provider}`);
  },

  async *_readOpenAIStream(body) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) yield content;
          } catch {}
        }
      }
    }
  },

  destroySession() {
    if (chromeSession) {
      try { chromeSession.destroy(); } catch {}
      chromeSession = null;
    }
  },
};
