// Right-click menu: a native popover styled like the ☰ menu (light dismiss + Esc for free).
// Items: { label, hint?, mono?, action } | { label, submenu: [...] } | { strip: [{ text?, icon?, title, active?, action }] }
//        | { section } | { info, mono? } | 'sep'. Falsy entries are skipped.
import { el } from '../utils/dom.js';

const MARGIN = 8;
const menu = el('div', { className: 'app-menu ctx-menu', popover: 'auto', role: 'menu' });
document.body.appendChild(menu);
let sub = null;
let hoverTimer = null;
let returnFocus = null;

// Shown first (still unpainted), then measured and moved: no frame at the wrong spot.
function place(pop, x, y, altX = x, altY = y) {
  const { width, height } = pop.getBoundingClientRect();
  const left = x + width > innerWidth - MARGIN ? altX - width : x;
  const top = y + height > innerHeight - MARGIN ? altY - height : y;
  pop.style.left = `${Math.max(MARGIN, Math.min(left, innerWidth - width - MARGIN))}px`;
  pop.style.top = `${Math.max(MARGIN, Math.min(top, innerHeight - height - MARGIN))}px`;
}

function run(action) {
  closeContextMenu();
  action();
}

function closeSub() {
  clearTimeout(hoverTimer);
  if (!sub) return;
  sub.remove(); // removing a shown popover hides it
  sub = null;
  menu.querySelector('.ctx-has-sub.open')?.classList.remove('open');
}

function openSub(row, items, focus) {
  if (sub?.matches(':popover-open') && sub.dataset.for === row.textContent) {
    if (focus) sub.querySelector('button')?.focus();
    return;
  }
  closeSub();
  const own = sub = el('div', { className: 'app-menu ctx-menu ctx-submenu', popover: 'auto', role: 'menu', dataset: { for: row.textContent } });
  // Closed by the popover itself (Esc, click elsewhere in the menu): forget it so it can reopen.
  own.addEventListener('toggle', (e) => { if (e.newState === 'closed' && sub === own) closeSub(); });
  fill(sub, items);
  menu.appendChild(sub); // nested in the menu, so showing it keeps the menu open
  sub.showPopover();
  const r = row.getBoundingClientRect();
  place(sub, r.right + 2, r.top - 6, r.left - 2, r.bottom + 6);
  row.classList.add('open');
  if (focus) sub.querySelector('button')?.focus();
}

function itemButton(label, hint, mono) {
  return el('button', { className: 'app-menu-item', role: 'menuitem' },
    el('span', {}, label), hint ? el('kbd', { className: mono ? 'ctx-mono' : '' }, hint) : null);
}

function fill(box, items) {
  const top = box === menu;
  for (const it of items) {
    if (!it) continue;
    if (it === 'sep') {
      box.append(el('div', { className: 'app-menu-sep' }));
    } else if (it.section) {
      box.append(el('div', { className: 'ctx-section' }, it.section));
    } else if (it.info) {
      box.append(el('div', { className: `ctx-info${it.mono ? ' ctx-mono' : ''}`, title: it.info }, it.info));
    } else if (it.strip) {
      box.append(el('div', { className: 'ctx-strip' }, ...it.strip.map(b => el('button', {
        className: b.active ? 'active' : '',
        title: b.title,
        'aria-label': b.title,
        ...(b.icon ? { unsafeHTML: b.icon } : {}),
        onClick: () => run(b.action),
      }, b.icon ? '' : b.text))));
    } else if (it.submenu) {
      const row = itemButton(it.label, '▸');
      row.classList.add('ctx-has-sub');
      row.setAttribute('aria-haspopup', 'menu');
      row.addEventListener('click', () => openSub(row, it.submenu, true));
      row.addEventListener('mouseenter', () => {
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => openSub(row, it.submenu, false), 150);
      });
      row.addEventListener('mouseleave', () => clearTimeout(hoverTimer));
      box.append(row);
    } else {
      const b = itemButton(it.label, it.hint, it.mono);
      b.addEventListener('click', () => run(it.action));
      if (top) b.addEventListener('mouseenter', closeSub);
      box.append(b);
    }
  }
}

// ↑/↓/Home/End move between the buttons of the menu (or submenu) holding focus.
menu.addEventListener('keydown', (e) => {
  const box = e.target.closest('.ctx-menu');
  const buttons = [...box.querySelectorAll('button')].filter(b => b.closest('.ctx-menu') === box);
  const i = buttons.indexOf(e.target);
  const go = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: buttons.length - 1 }[e.key];
  if (go !== undefined) {
    e.preventDefault();
    buttons[(go + buttons.length) % buttons.length]?.focus();
  } else if (e.key === 'ArrowRight' && e.target.classList.contains('ctx-has-sub')) {
    e.preventDefault();
    e.target.click();
  } else if (e.key === 'ArrowLeft' && box === sub) {
    e.preventDefault();
    const row = menu.querySelector('.ctx-has-sub.open');
    closeSub();
    row?.focus();
  }
});

menu.addEventListener('toggle', (e) => {
  if (e.newState !== 'closed') return;
  closeSub();
  if (menu.contains(document.activeElement) || document.activeElement === document.body) {
    returnFocus?.focus({ preventScroll: true });
  }
});

/** Open the menu at (x, y) in viewport pixels, replacing any open one. */
export function openContextMenu(x, y, items) {
  if (!menu.matches(':popover-open')) returnFocus = document.activeElement;
  closeContextMenu();
  menu.replaceChildren();
  fill(menu, items);
  menu.showPopover();
  place(menu, x, y);
  menu.querySelector('button')?.focus({ preventScroll: true });
}

export function closeContextMenu() {
  if (menu.matches(':popover-open')) menu.hidePopover();
}
