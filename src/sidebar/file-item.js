import { el } from '../utils/dom.js';
import { icons } from '../toolbar/toolbar-icons.js';

export function createFileItem(file, { onOpen, onRename, onDelete, isActive, icon }) {
  const item = el('div', {
    className: `file-item${isActive ? ' active' : ''}`,
    onClick: () => onOpen(file),
  },
    el('span', { className: 'file-item-icon', unsafeHTML: icon || icons.file }),
    el('span', { className: 'file-item-name', title: file.name }, file.name),
    el('div', { className: 'file-item-actions' },
      el('button', {
        className: 'file-item-btn',
        'data-tooltip': 'Rename',
        unsafeHTML: icons.rename,
        onClick: (e) => { e.stopPropagation(); onRename(file); },
      }),
      el('button', {
        className: 'file-item-btn',
        'data-tooltip': 'Delete',
        unsafeHTML: icons.trash,
        onClick: (e) => { e.stopPropagation(); onDelete(file); },
      }),
    ),
  );

  return item;
}
