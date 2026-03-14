import { el, injectStyles } from '../utils/dom.js';

let container;

function ensureContainer() {
  if (!container) {
    container = el('div', { className: 'toast-container', 'aria-live': 'polite', role: 'status' });
    document.body.appendChild(container);
  }
  return container;
}

export function toast(message, type = 'info', duration = 3000) {
  const c = ensureContainer();
  const t = el('div', { className: `toast toast-${type}`, ...(type === 'error' ? { role: 'alert' } : {}) }, message);
  c.appendChild(t);

  requestAnimationFrame(() => t.classList.add('toast-visible'));

  const dismiss = () => {
    t.classList.remove('toast-visible');
    t.addEventListener('transitionend', () => t.remove(), { once: true });
    setTimeout(() => t.remove(), 300); // fallback
  };

  if (duration > 0) {
    setTimeout(dismiss, duration);
  }

  t.addEventListener('click', dismiss);
  return dismiss;
}

// Inject toast styles
injectStyles(`
.toast-container {
  position: fixed;
  bottom: 32px;
  right: 16px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}
.toast {
  padding: 8px 16px;
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  color: #fff;
  background: var(--text-primary);
  box-shadow: var(--shadow-lg);
  pointer-events: auto;
  cursor: pointer;
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 0.2s ease, transform 0.2s ease;
  max-width: 360px;
  word-break: break-word;
}
.toast-visible {
  opacity: 1;
  transform: translateY(0);
}
.toast-success { background: var(--success); }
.toast-error { background: var(--error); }
.toast-warning { background: var(--warning); }
`);
