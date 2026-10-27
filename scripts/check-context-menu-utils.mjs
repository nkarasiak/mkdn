// Self-check for the right-click menu helpers: node scripts/check-context-menu-utils.mjs
import assert from 'node:assert/strict';
import { slugify, compareCells, sortRows, toTsv } from '../src/editor/context-menu-utils.js';

assert.equal(slugify('Day 2 — Lyon'), 'day-2--lyon');
assert.equal(slugify('Hello, World!'), 'hello-world');
assert.equal(slugify('Café au lait'), 'café-au-lait');
assert.ok(compareCells('9', '10') < 0);
assert.ok(compareCells('275 €', '310 €') < 0);
assert.deepEqual(sortRows([['b'], [''], ['a']], 0, 1), [['a'], ['b'], ['']]);
assert.deepEqual(sortRows([['b'], [''], ['a']], 0, -1), [['b'], ['a'], ['']]);
assert.equal(toTsv([['a', 'b\tc'], ['1', 'x\ny']]), 'a\tb c\n1\tx y');
console.log('context-menu-utils OK');
