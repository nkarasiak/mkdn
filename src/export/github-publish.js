import { el } from '../utils/dom.js';
import { documentStore } from '../store/document-store.js';
import { settingsStore } from '../store/settings-store.js';
import { toast } from '../ui/toast.js';

export function openGithubPublish() {
  const overlay = el('div', { className: 'ai-settings-overlay' });

  const savedToken = settingsStore.get('githubToken') || '';
  const savedRepo = settingsStore.get('githubRepo') || '';
  const savedBranch = settingsStore.get('githubBranch') || 'main';

  const tokenInput = el('input', {
    type: 'password',
    className: 'ai-settings-input',
    placeholder: 'ghp_xxxx...',
    value: savedToken,
  });

  const repoInput = el('input', {
    type: 'text',
    className: 'ai-settings-input',
    placeholder: 'owner/repo',
    value: savedRepo,
  });

  const branchInput = el('input', {
    type: 'text',
    className: 'ai-settings-input',
    placeholder: 'main',
    value: savedBranch,
  });

  const pathInput = el('input', {
    type: 'text',
    className: 'ai-settings-input',
    placeholder: 'docs/my-file.md',
    value: documentStore.getFileName(),
  });

  const statusEl = el('div', { className: 'ai-settings-hint', style: { minHeight: '20px' } });

  const publishBtn = el('button', {
    className: 'ai-settings-save',
    onClick: async () => {
      const token = tokenInput.value.trim();
      const repo = repoInput.value.trim();
      const branch = branchInput.value.trim() || 'main';
      const path = pathInput.value.trim();

      if (!token || !repo || !path) {
        toast('Fill in all fields', 'warning');
        return;
      }

      // Save for next time
      settingsStore.set('githubToken', token);
      settingsStore.set('githubRepo', repo);
      settingsStore.set('githubBranch', branch);

      statusEl.textContent = 'Publishing...';
      publishBtn.disabled = true;

      try {
        await publishToGithub(token, repo, branch, path, documentStore.getMarkdown());
        statusEl.textContent = 'Published successfully!';
        toast('Published to GitHub', 'success');
        setTimeout(() => overlay.remove(), 1500);
      } catch (e) {
        statusEl.textContent = `Error: ${e.message}`;
        publishBtn.disabled = false;
      }
    },
  }, 'Publish');

  const cancelBtn = el('button', {
    className: 'ai-settings-cancel',
    onClick: () => overlay.remove(),
  }, 'Cancel');

  const dialog = el('div', { className: 'ai-settings-dialog' },
    el('h3', {}, 'Publish to GitHub'),
    el('label', {}, 'Personal Access Token'),
    tokenInput,
    el('p', { className: 'ai-settings-hint' }, 'Needs "repo" or "contents:write" scope. Stored locally.'),
    el('label', {}, 'Repository (owner/repo)'),
    repoInput,
    el('label', {}, 'Branch'),
    branchInput,
    el('label', {}, 'File Path'),
    pathInput,
    statusEl,
    el('div', { className: 'ai-settings-actions' }, cancelBtn, publishBtn),
  );

  overlay.appendChild(dialog);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
}

async function publishToGithub(token, repo, branch, path, content) {
  const apiBase = 'https://api.github.com';
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };

  // Check if file already exists (to get SHA for update)
  let sha = null;
  try {
    const resp = await fetch(`${apiBase}/repos/${repo}/contents/${path}?ref=${branch}`, { headers });
    if (resp.ok) {
      const data = await resp.json();
      sha = data.sha;
    }
  } catch {}

  // Create or update file
  const body = {
    message: sha ? `Update ${path}` : `Add ${path}`,
    content: btoa(unescape(encodeURIComponent(content))),
    branch,
  };
  if (sha) body.sha = sha;

  const resp = await fetch(`${apiBase}/repos/${repo}/contents/${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${resp.status}`);
  }
}
