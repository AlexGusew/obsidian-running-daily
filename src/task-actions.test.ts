import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Editor, EditorChange, EditorSelection } from 'obsidian';
import { CYCLE, applyTaskStatus, getSelectedLines, getSelectedTaskLines } from './task-actions.ts';

/** Tiny editor stub: lines, selections, and the transactions it received. */
function stub(lines: string[], selections: EditorSelection[]): { editor: Editor; transactions: EditorChange[][] } {
	const transactions: EditorChange[][] = [];
	const editor = {
		listSelections: () => selections,
		lineCount: () => lines.length,
		getLine: (line: number) => lines[line] ?? '',
		transaction: (tx: { changes: EditorChange[] }) => {
			transactions.push(tx.changes);
		},
	};
	return { editor: editor as unknown as Editor, transactions };
}

const sel = (aLine: number, aCh: number, hLine: number, hCh: number): EditorSelection => ({
	anchor: { line: aLine, ch: aCh },
	head: { line: hLine, ch: hCh },
});

const LINES = ['- [ ] a', 'text', '- [/] b', '- [x] c', '- [-] d'];

test('selection direction does not matter', () => {
	const forward = stub(LINES, [sel(0, 2, 2, 3)]).editor;
	const backward = stub(LINES, [sel(2, 3, 0, 2)]).editor;
	assert.deepEqual(getSelectedLines(forward), [0, 1, 2]);
	assert.deepEqual(getSelectedLines(backward), [0, 1, 2]);
});

test('a multi-line selection ending at column 0 excludes that line, in either direction', () => {
	assert.deepEqual(getSelectedLines(stub(LINES, [sel(0, 0, 2, 0)]).editor), [0, 1]);
	assert.deepEqual(getSelectedLines(stub(LINES, [sel(2, 0, 0, 0)]).editor), [0, 1]);
	// A cursor at column 0 still covers its own line.
	assert.deepEqual(getSelectedLines(stub(LINES, [sel(3, 0, 3, 0)]).editor), [3]);
});

test('overlapping cursors and selections give unique, sorted task lines', () => {
	const { editor } = stub(LINES, [sel(3, 1, 3, 1), sel(0, 1, 2, 4), sel(2, 1, 3, 2)]);
	assert.deepEqual(getSelectedTaskLines(editor), [0, 2, 3]);
});

test('applyTaskStatus changes all lines in one transaction and skips unchanged ones', () => {
	const { editor, transactions } = stub(LINES, []);
	assert.equal(applyTaskStatus(editor, [0, 1, 2, 2, 3, 99], 'x'), 2);
	assert.equal(transactions.length, 1);
	assert.deepEqual(transactions[0], [
		{ from: { line: 0, ch: 3 }, to: { line: 0, ch: 4 }, text: 'x' },
		{ from: { line: 2, ch: 3 }, to: { line: 2, ch: 4 }, text: 'x' },
	]);
});

test('applyTaskStatus cycles each task; nothing to do means no transaction', () => {
	const { editor, transactions } = stub(LINES, []);
	assert.equal(applyTaskStatus(editor, [0, 2, 3, 4], CYCLE), 4);
	assert.deepEqual(
		transactions[0]?.map((c) => c.text),
		['/', 'x', ' ', ' '],
	);
	assert.equal(applyTaskStatus(editor, [1], CYCLE), 0);
	assert.equal(transactions.length, 1);
});
