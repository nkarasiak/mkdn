import { el } from '../utils/dom.js';
import { documentStore } from '../store/document-store.js';
import { settingsStore } from '../store/settings-store.js';
import { toast } from '../ui/toast.js';

export function openGithubPublish() {
  const overlay = el('div', { className: 'ai-settings-overlay' });

  // Migrate: remove token from persistent localStorage if it was stored there before
  if (settingsStore.get('githubToken')) {
    sessionStorage.setItem('mkdn-github-token', settingsStore.get('githubToken'));
    settingsStore.set('githubToken', undefined);
    try { localStorage.removeItem('mkdn-settings-githubToken'); } catch {}
  }

  // Token uses sessionStorage (cleared on tab close) for security
  const savedToken = sessionStorage.getItem('mkdn-github-token') || '';
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

      // Save repo/branch persistently, token only for this session
      sessionStorage.setItem('mkdn-github-token', token);
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
    el('p', { className: 'ai-settings-hint' }, 'Needs "repo" or "contents:write" scope. Token is stored only for this session.'),
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

// Validate repo format: "owner/repo" with safe characters only
function isValidRepo(repo) {
  return /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(repo);
}

// Validate file path: no traversal, no control chars, no double dots
function isValidPath(path) {
  if (!path || path.includes('..') || path.startsWith('/')) return false;
  if (/[\x00-\x1f\x7f]/.test(path)) return false;
  return /^[a-zA-Z0-9._\-/]+$/.test(path);
}

// Validate branch name: safe git ref characters
function isValidBranch(branch) {
  return /^[a-zA-Z0-9._\-/]+$/.test(branch) && !branch.includes('..');
}

// Build a safe GitHub API URL using URL constructor
function buildGithubUrl(repo, path, params = {}) {
  const url = new URL(`https://api.github.com/repos/${encodeURI(repo)}/contents/${encodeURI(path)}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return url.href;
}

async function publishToGithub(token, repo, branch, path, content) {
  if (!isValidRepo(repo)) throw new Error('Invalid repository format. Use "owner/repo".');
  if (!isValidPath(path)) throw new Error('Invalid file path. Avoid "..", leading "/", or special characters.');
  if (!isValidBranch(branch)) throw new Error('Invalid branch name.');

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };

  // Check if file already exists (to get SHA for update)
  let sha = null;
  try {
    const resp = await fetch(buildGithubUrl(repo, path, { ref: branch }), { headers });
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

  const resp = await fetch(buildGithubUrl(repo, path), {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${resp.status}`);
  }
}
