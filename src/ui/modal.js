import { el } from '../utils/dom.js';

let overlay;

function ensureOverlay() {
  if (!overlay) {
    overlay = el('div', { className: 'modal-overlay' });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
    document.body.appendChild(overlay);
  }
  return overlay;
}

let currentReject;

export function closeModal() {
  if (overlay && overlay.classList.contains('modal-open')) {
    overlay.classList.remove('modal-open');
    overlay.innerHTML = '';
    if (currentReject) {
      currentReject(new Error('cancelled'));
      currentReject = null;
    }
    return true;
  }
  // Also close standalone modal overlays (save picker, history preview, etc.)
  const standalone = document.querySelector('.modal-overlay.modal-open');
  if (standalone && standalone !== overlay) {
    standalone.dispatchEvent(new Event('modal:close'));
    standalone.classList.remove('modal-open');
    standalone.remove();
    return true;
  }
  return false;
}

export function confirm(message, { title = 'Confirm', okText = 'OK', cancelText = 'Cancel', danger = false } = {}) {
  return new Promise((resolve, reject) => {
    currentReject = reject;
    const o = ensureOverlay();
    o.innerHTML = '';

    const modal = el('div', { className: 'modal' },
      el('div', { className: 'modal-header' }, title),
      el('div', { className: 'modal-body' }, message),
      el('div', { className: 'modal-footer' },
        el('button', { className: 'modal-btn', onClick: () => { closeModal(); resolve(false); } }, cancelText),
        el('button', { className: `modal-btn modal-btn-primary${danger ? ' modal-btn-danger' : ''}`, onClick: () => { currentReject = null; closeModal(); resolve(true); } }, okText),
      ),
    );

    o.appendChild(modal);
    requestAnimationFrame(() => o.classList.add('modal-open'));
  });
}

export function prompt(message, { title = 'Input', defaultValue = '', placeholder = '' } = {}) {
  return new Promise((resolve, reject) => {
    currentReject = reject;
    const o = ensureOverlay();
    o.innerHTML = '';

    const input = el('input', { type: 'text', value: defaultValue, placeholder, className: 'modal-input' });

    const submit = () => {
      currentReject = null;
      const val = input.value.trim();
      closeModal();
      resolve(val || null);
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
      if (e.key === 'Escape') closeModal();
    });

    const modal = el('div', { className: 'modal' },
      el('div', { className: 'modal-header' }, title),
      el('div', { className: 'modal-body' },
        el('p', { style: { marginBottom: '8px' } }, message),
        input,
      ),
      el('div', { className: 'modal-footer' },
        el('button', { className: 'modal-btn', onClick: closeModal }, 'Cancel'),
        el('button', { className: 'modal-btn modal-btn-primary', onClick: submit }, 'OK'),
      ),
    );

    o.appendChild(modal);
    requestAnimationFrame(() => {
      o.classList.add('modal-open');
      input.focus();
      input.select();
    });
  });
}

export function showInfo(title, message) {
  const o = ensureOverlay();
  o.innerHTML = '';

  const modal = el('div', { className: 'modal' },
    el('div', { className: 'modal-header' }, title),
    el('div', { className: 'modal-body' }, message),
    el('div', { className: 'modal-footer' },
      el('button', { className: 'modal-btn modal-btn-primary', onClick: closeModal }, 'OK'),
    ),
  );

  o.appendChild(modal);
  requestAnimationFrame(() => o.classList.add('modal-open'));
}

// Inject modal styles
const style = document.createElement('style');
style.textContent = `
.modal-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: var(--bg-overlay);
  z-index: 200;
  align-items: center;
  justify-content: center;
}
.modal-overlay.modal-open {
  display: flex;
}
.modal {
  background: var(--bg-primary);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  min-width: 320px;
  max-width: 480px;
  width: 90vw;
  overflow: hidden;
}
.modal-header {
  padding: 16px 20px 12px;
  font-weight: 600;
  font-size: var(--font-size-lg);
  border-bottom: 1px solid var(--border-light);
}
.modal-body {
  padding: 16px 20px;
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  line-height: 1.6;
}
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px 16px;
}
.modal-btn {
  padding: 6px 16px;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  font-weight: 500;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  transition: background var(--transition-fast);
}
.modal-btn:hover { background: var(--bg-active); }
.modal-btn-primary {
  background: var(--accent);
  color: var(--accent-text);
}
.modal-btn-primary:hover { background: var(--accent-hover); }
.modal-btn-danger {
  background: var(--error);
}
.modal-btn-danger:hover { background: #b91c1c; }
.modal-input {
  width: 100%;
  padding: 8px 12px;
  font-size: var(--font-size-base);
}
`;
document.head.appendChild(style);
