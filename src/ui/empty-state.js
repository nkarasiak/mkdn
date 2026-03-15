import { el, injectStyles } from '../utils/dom.js';

/**
 * Create a styled empty state with icon, title, description, and optional action button.
 * @param {object} opts
 * @param {string} opts.icon - SVG string for the icon
 * @param {string} opts.title - Main title text
 * @param {string} opts.description - Supporting description text
 * @param {{ label: string, onClick: Function }} [opts.action] - Optional action button
 * @returns {HTMLElement}
 */
export function createEmptyState({ icon, title, description, action }) {
  const children = [
    el('div', { className: 'empty-state-icon', unsafeHTML: icon }),
    el('div', { className: 'empty-state-title' }, title),
    el('div', { className: 'empty-state-desc' }, description),
  ];
  if (action) {
    children.push(
      el('button', {
        className: 'empty-state-btn',
        onClick: action.onClick,
      }, action.label),
    );
  }
  return el('div', { className: 'empty-state' }, ...children);
}

injectStyles(`
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 24px 16px;
  gap: 6px;
}
.empty-state-icon {
  width: 32px;
  height: 32px;
  color: var(--text-muted);
  opacity: 0.5;
  margin-bottom: 4px;
}
.empty-state-icon svg {
  width: 32px;
  height: 32px;
}
.empty-state-title {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-secondary);
  font-family: var(--font-sans);
}
.empty-state-desc {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  font-family: var(--font-sans);
  line-height: 1.5;
  max-width: 200px;
}
.empty-state-btn {
  margin-top: 8px;
  padding: 6px 14px;
  font-size: var(--font-size-xs);
  font-weight: 500;
  font-family: var(--font-sans);
  background: var(--accent);
  color: var(--accent-text);
  border-radius: var(--radius-md);
  transition: background var(--transition-fast);
  cursor: pointer;
}
.empty-state-btn:hover {
  background: var(--accent-hover);
}
`);
