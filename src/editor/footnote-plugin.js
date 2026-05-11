import { Plugin, PluginKey } from '@milkdown/prose/state';

const footnoteKey = new PluginKey('footnote-popover');

let popoverEl = null;
let hideTimer = null;

function ensurePopover() {
  if (popoverEl) return popoverEl;
  popoverEl = document.createElement('div');
  popoverEl.className = 'footnote-popover-floating';
  popoverEl.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  popoverEl.addEventListener('mouseleave', () => hidePopover());
  document.body.appendChild(popoverEl);
  return popoverEl;
}

function getDefinitionBody(label, editorRoot) {
  const dl = editorRoot.querySelector(`dl[data-type="footnote_definition"][data-label="${CSS.escape(label)}"]`);
  if (!dl) return '';
  const dd = dl.querySelector('dd');
  return dd ? dd.textContent.trim() : '';
}

function showPopoverFor(sup, editorRoot) {
  const label = sup.getAttribute('data-label');
  if (!label) return;
  const body = getDefinitionBody(label, editorRoot);
  if (!body) return;
  const p = ensurePopover();
  p.textContent = body;
  p.classList.add('visible');

  const rect = sup.getBoundingClientRect();
  // Wait for the popover to have measured size before positioning
  requestAnimationFrame(() => {
    const pw = p.offsetWidth;
    const ph = p.offsetHeight;
    let left = rect.left + rect.width / 2 - pw / 2;
    let top = rect.top - ph - 8;
    if (left < 8) left = 8;
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
    if (top < 8) top = rect.bottom + 8;
    p.style.left = `${left}px`;
    p.style.top = `${top}px`;
  });
}

function hidePopover() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (popoverEl) popoverEl.classList.remove('visible');
  }, 80);
}

export function createFootnotePlugin() {
  return new Plugin({
    key: footnoteKey,
    view(editorView) {
      const root = editorView.dom;

      function onMouseOver(e) {
        const sup = e.target.closest('sup[data-type="footnote_reference"]');
        if (!sup || !root.contains(sup)) return;
        clearTimeout(hideTimer);
        showPopoverFor(sup, root);
      }

      function onMouseOut(e) {
        const sup = e.target.closest('sup[data-type="footnote_reference"]');
        if (!sup) return;
        hidePopover();
      }

      root.addEventListener('mouseover', onMouseOver);
      root.addEventListener('mouseout', onMouseOut);

      return {
        destroy() {
          root.removeEventListener('mouseover', onMouseOver);
          root.removeEventListener('mouseout', onMouseOut);
          if (popoverEl) {
            popoverEl.remove();
            popoverEl = null;
          }
        },
      };
    },
  });
}
