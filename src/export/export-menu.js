import { el, injectStyles } from '../utils/dom.js';

let menuEl = null;

function closeMenu() {
  if (menuEl) {
    menuEl.remove();
    menuEl = null;
    document.removeEventListener('click', onOutsideClick);
  }
}

function onOutsideClick(e) {
  if (menuEl && !menuEl.contains(e.target)) closeMenu();
}

export function showExportMenu(anchorEl) {
  if (menuEl) { closeMenu(); return; }

  const items = [
    { label: 'Download .md', icon: '\u{1F4DD}', action: () => import('../utils/export.js').then(m => m.downloadMarkdown()) },
    { label: 'Export HTML', icon: '\u{1F310}', action: () => import('./html-export.js').then(m => m.exportStyledHtml()) },
    { label: 'Export DOCX', icon: '\u{1F4C4}', action: () => import('./docx-export.js').then(m => m.exportDocx()) },
    { label: 'Print / PDF', icon: '\u{1F5A8}\uFE0F', action: () => import('../utils/export.js').then(m => m.printDocument()) },
  ];

  menuEl = el('div', { className: 'export-menu' },
    ...items.map(item =>
      el('button', {
        className: 'export-menu-item',
        onClick: () => { closeMenu(); item.action(); },
      },
        el('span', { className: 'export-menu-icon' }, item.icon),
        el('span', {}, item.label),
      )
    ),
  );

  const rect = anchorEl.getBoundingClientRect();
  menuEl.style.position = 'fixed';
  menuEl.style.top = `${rect.bottom + 6}px`;
  menuEl.style.right = `${window.innerWidth - rect.right}px`;

  document.body.appendChild(menuEl);
  requestAnimationFrame(() => {
    menuEl?.classList.add('open');
    document.addEventListener('click', onOutsideClick);
  });
}

injectStyles(`
  .export-menu {
    min-width: 170px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    z-index: 200;
    padding: 4px;
    opacity: 0;
    transform: translateY(-4px);
    transition: opacity 0.12s ease, transform 0.12s ease;
  }
  .export-menu.open {
    opacity: 1;
    transform: translateY(0);
  }
  .export-menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 12px;
    font-family: var(--font-sans);
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    text-align: left;
    cursor: pointer;
    transition: background 0.08s ease;
  }
  .export-menu-item:hover {
    background: var(--bg-hover);
  }
  .export-menu-icon {
    width: 18px;
    text-align: center;
    font-size: 13px;
    flex-shrink: 0;
  }
`);
