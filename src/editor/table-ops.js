// Table edits Milkdown has no command for (sort, delete the whole table).
import { Fragment } from '@milkdown/prose/model';
import { sortRows } from './context-menu-utils.js';

const cellTexts = row => { const cells = []; row.forEach(c => cells.push(c.textContent)); return cells; };

/** The table's cell text, header row first. */
export function tableRows(table) {
  const rows = [];
  table.forEach(row => rows.push(cellTexts(row)));
  return rows;
}

/** Sort the body rows by column `col` (dir 1 ascending, -1 descending); the header row stays first. */
export function sortTable(view, tablePos, col, dir) {
  const table = view.state.doc.nodeAt(tablePos);
  const [head, ...body] = Array.from({ length: table.childCount }, (_, i) => table.child(i));
  const order = sortRows(body.map((row, i) => [...cellTexts(row), i]), col, dir).map(r => body[r[r.length - 1]]);
  view.dispatch(view.state.tr.replaceWith(tablePos, tablePos + table.nodeSize, table.copy(Fragment.from([head, ...order]))));
}

export function deleteTable(view, tablePos) {
  const table = view.state.doc.nodeAt(tablePos);
  view.dispatch(view.state.tr.delete(tablePos, tablePos + table.nodeSize));
}
