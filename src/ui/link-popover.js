import { el } from '../utils/dom.js';
import { milkdown } from '../editor/milkdown-setup.js';

const popover = el('div', { className: 'link-popover' },
  el('div', { className: 'link-popover-header' }, 'Create link'),
  el('input', { type: 'text', className: 'link-popover-input', placeholder: 'Link text' }),
  el('input', { type: 'text', className: 'link-popover-input', placeholder: 'Enter URL...' }),
  el('div', { className: 'link-popover-footer' },
    el('button', { className: 'link-popover-btn link-popover-btn-primary', onClick: () => submit() }, 'Link'),
    el('button', { className: 'link-popover-btn', onClick: () => close() }, 'Cancel'),
  ),
);
const [textInput, urlInput] = popover.querySelectorAll('input');
document.body.appendChild(popover);

function close() {
  popover.classList.remove('link-popover-open');
}

function submit() {
  const text = textInput.value.trim();
  const url = urlInput.value.trim();
  close();
  if (url) milkdown.insertLink(text || url, url);
}

/**
 * Open the link popover, positioned near an anchor element or the current
 * selection if no anchor is given.
 * @param {HTMLElement} [anchor] - element to position the popover below
 */
export function openLinkPopover(anchor) {
  const selected = milkdown.getSelectedText();
  textInput.value = selected;
  urlInput.value = '';

  // Position the popover
  let top, left;
  if (anchor) {
    const rect = anchor.getBoundingClientRect();
    top = rect.bottom + 6;
    left = rect.left + rect.width / 2;
  } else {
    // Try to position near the browser selection
    const sel = window.getSelection();
    if (sel.rangeCount) {
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) {
        top = rect.bottom + 6;
        left = rect.left + rect.width / 2;
      }
    }
    // Fallback: center of viewport
    if (top == null) {
      top = window.innerHeight / 3;
      left = window.innerWidth / 2;
    }
  }

  popover.style.top = `${top}px`;
  popover.style.left = `${left}px`;
  popover.classList.add('link-popover-open');
  urlInput.focus();
}

// Keyboard handling inside the popover
popover.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); submit(); }
});

// Close when clicking outside
document.addEventListener('mousedown', (e) => {
  if (popover.classList.contains('link-popover-open') && !popover.contains(e.target)) {
    close();
  }
});
