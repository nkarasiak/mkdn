import { el, injectStyles } from '../utils/dom.js';

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

function trapFocus(modal) {
  modal.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const focusable = modal.querySelectorAll('button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])');
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
}

function animateClose(overlayEl, callback) {
  overlayEl.classList.remove('modal-open');
  const onEnd = () => {
    overlayEl.removeEventListener('transitionend', onEnd);
    callback();
  };
  overlayEl.addEventListener('transitionend', onEnd);
  // Fallback in case transitionend doesn't fire
  setTimeout(onEnd, 300);
}

export function closeModal() {
  if (overlay && overlay.classList.contains('modal-open')) {
    const reject = currentReject;
    currentReject = null;
    animateClose(overlay, () => {
      overlay.replaceChildren();
      if (reject) reject(new Error('cancelled'));
    });
    return true;
  }
  // Also close standalone modal overlays (save picker, history preview, etc.)
  const standalone = document.querySelector('.modal-overlay.modal-open');
  if (standalone && standalone !== overlay) {
    standalone.dispatchEvent(new Event('modal:close'));
    animateClose(standalone, () => standalone.remove());
    return true;
  }
  return false;
}

export function confirm(message, { title = 'Confirm', okText = 'OK', cancelText = 'Cancel', danger = false } = {}) {
  return new Promise((resolve, reject) => {
    currentReject = reject;
    const o = ensureOverlay();
    o.replaceChildren();

    const headerId = 'modal-header-' + Date.now();
    const okBtn = el('button', { className: `modal-btn modal-btn-primary${danger ? ' modal-btn-danger' : ''}`, onClick: () => { currentReject = null; closeModal(); resolve(true); } }, okText);
    const modal = el('div', { className: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': headerId },
      el('div', { className: 'modal-header', id: headerId }, title),
      el('div', { className: 'modal-body' }, message),
      el('div', { className: 'modal-footer' },
        el('button', { className: 'modal-btn', onClick: () => { closeModal(); resolve(false); } }, cancelText),
        okBtn,
      ),
    );

    trapFocus(modal);
    o.appendChild(modal);
    requestAnimationFrame(() => { o.classList.add('modal-open'); okBtn.focus(); });
  });
}

export function prompt(message, { title = 'Input', defaultValue = '', placeholder = '' } = {}) {
  return new Promise((resolve, reject) => {
    currentReject = reject;
    const o = ensureOverlay();
    o.replaceChildren();

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

    const headerId = 'modal-header-' + Date.now();
    const modal = el('div', { className: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': headerId },
      el('div', { className: 'modal-header', id: headerId }, title),
      el('div', { className: 'modal-body' },
        el('p', { style: { marginBottom: '8px' } }, message),
        input,
      ),
      el('div', { className: 'modal-footer' },
        el('button', { className: 'modal-btn', onClick: closeModal }, 'Cancel'),
        el('button', { className: 'modal-btn modal-btn-primary', onClick: submit }, 'OK'),
      ),
    );

    trapFocus(modal);
    o.appendChild(modal);
    requestAnimationFrame(() => {
      o.classList.add('modal-open');
      input.focus();
      input.select();
    });
  });
}

export function showInfo(title, content) {
  const o = ensureOverlay();
  o.replaceChildren();

  const headerId = 'modal-header-' + Date.now();
  const isNode = content instanceof Node;
  const okBtn = el('button', { className: 'modal-btn modal-btn-primary', onClick: closeModal }, 'OK');
  const modal = el('div', { className: `modal${isNode ? ' modal-wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': headerId },
    el('div', { className: 'modal-header', id: headerId }, title),
    el('div', { className: 'modal-body' }, ...(isNode ? [content] : [content])),
    el('div', { className: 'modal-footer' }, okBtn),
  );

  trapFocus(modal);
  o.appendChild(modal);
  requestAnimationFrame(() => { o.classList.add('modal-open'); okBtn.focus(); });
}

// Inject modal styles
injectStyles(`
.modal-overlay {
  display: flex;
  position: fixed;
  inset: 0;
  background: var(--bg-overlay);
  z-index: 200;
  align-items: center;
  justify-content: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
}
.modal-overlay.modal-open {
  opacity: 1;
  pointer-events: auto;
}
.modal {
  background: var(--bg-primary);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  min-width: 320px;
  max-width: 480px;
  width: 90vw;
  overflow: hidden;
  transform: scale(0.96) translateY(4px);
  opacity: 0;
  transition: transform var(--transition-spring, 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)), opacity 0.2s ease;
}
.modal-overlay.modal-open .modal {
  transform: scale(1) translateY(0);
  opacity: 1;
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
.modal-btn-danger:hover { background: color-mix(in srgb, var(--error) 85%, black); }
.modal-input {
  width: 100%;
  padding: 8px 12px;
  font-size: var(--font-size-base);
}
.modal.modal-wide {
  max-width: 560px;
}
.about-content { font-size: var(--font-size-sm); }
.about-description {
  margin-bottom: 8px;
  color: var(--text-secondary);
}
.about-section-title {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-primary);
  margin: 14px 0 6px;
}
.about-section-title:first-child { margin-top: 0; }
.about-shortcuts {
  width: 100%;
  border-collapse: collapse;
}
.about-shortcuts td {
  padding: 3px 0;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}
.about-shortcut-keys {
  white-space: nowrap;
  width: 1%;
  padding-right: 16px !important;
}
.about-shortcut-keys kbd {
  display: inline-block;
  padding: 1px 6px;
  font-family: var(--font-mono);
  font-size: 11px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  margin-right: 2px;
}
.about-link {
  color: var(--accent);
  text-decoration: none;
}
.about-link:hover { text-decoration: underline; }
.about-version {
  margin-top: 12px;
  color: var(--text-muted);
  font-size: var(--font-size-xs);
}
`);
