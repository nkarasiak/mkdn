import { el, injectStyles } from '../utils/dom.js';

const MAX_ROWS = 6;
const MAX_COLS = 6;

export function createTablePicker(onSelect) {
  let hoverRow = 0;
  let hoverCol = 0;

  const label = el('div', { className: 'table-picker-label' }, 'Table');
  const grid = el('div', { className: 'table-picker-grid' });

  const cells = [];
  for (let r = 0; r < MAX_ROWS; r++) {
    for (let c = 0; c < MAX_COLS; c++) {
      const cell = el('div', { className: 'table-picker-cell' });
      cell.dataset.row = r;
      cell.dataset.col = c;
      cell.addEventListener('mouseenter', () => {
        hoverRow = r;
        hoverCol = c;
        updateHighlight();
      });
      cell.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelect(r + 1, c + 1);
      });
      cells.push(cell);
      grid.appendChild(cell);
    }
  }

  function updateHighlight() {
    for (const cell of cells) {
      const r = +cell.dataset.row;
      const c = +cell.dataset.col;
      cell.classList.toggle('active', r <= hoverRow && c <= hoverCol);
    }
    label.textContent = `${hoverRow + 1} × ${hoverCol + 1}`;
  }

  grid.addEventListener('mouseleave', () => {
    hoverRow = -1;
    hoverCol = -1;
    for (const cell of cells) cell.classList.remove('active');
    label.textContent = 'Table';
  });

  const picker = el('div', { className: 'table-picker' }, label, grid);
  return picker;
}

// Inject styles
injectStyles(`
.table-picker {
  padding: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.table-picker-label {
  font-size: var(--font-size-sm, 13px);
  color: var(--text-secondary);
  font-weight: 500;
  user-select: none;
}
.table-picker-grid {
  display: grid;
  grid-template-columns: repeat(${MAX_COLS}, 20px);
  grid-template-rows: repeat(${MAX_ROWS}, 20px);
  gap: 3px;
}
.table-picker-cell {
  width: 20px;
  height: 20px;
  border: 1.5px solid var(--border-light);
  border-radius: 3px;
  cursor: pointer;
  transition: background 0.08s, border-color 0.08s;
}
.table-picker-cell:hover,
.table-picker-cell.active {
  background: color-mix(in srgb, var(--accent) 25%, transparent);
  border-color: var(--accent);
}
`);
