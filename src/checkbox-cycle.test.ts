import { test } from 'node:test';
import assert from 'node:assert/strict';
import { absoluteLine, cycleTaskAtLine, documentLine } from './checkbox-cycle.ts';

test('absoluteLine adds the section start to data-line', () => {
	assert.equal(absoluteLine(10, '0'), 10);
	assert.equal(absoluteLine(10, '3'), 13);
	assert.equal(absoluteLine(0, '7'), 7);
	assert.equal(absoluteLine(5, undefined), null);
	assert.equal(absoluteLine(5, ''), null);
	assert.equal(absoluteLine(5, '-1'), null);
	assert.equal(absoluteLine(5, 'x'), null);
});

test('documentLine reads whole-document text by absolute line', () => {
	const text = '# A\n\n- [ ] one\n- [x] two\n\ntail';
	assert.equal(documentLine(text, 2), '- [ ] one');
	assert.equal(documentLine(text, 3), '- [x] two');
	assert.equal(documentLine(text, 99), null);
});

test('documentLine strips CR', () => {
	assert.equal(documentLine('a\r\n- [/] b\r\nc', 1), '- [/] b');
});

test('cycleTaskAtLine cycles todo → in progress → done → todo', () => {
	let content = 'x\n- [ ] task\n';
	const r1 = cycleTaskAtLine(content, 1);
	assert.deepEqual(r1, { content: 'x\n- [/] task\n', status: '/' });
	content = r1?.content ?? '';
	const r2 = cycleTaskAtLine(content, 1);
	assert.deepEqual(r2, { content: 'x\n- [x] task\n', status: 'x' });
	const r3 = cycleTaskAtLine(r2?.content ?? '', 1);
	assert.deepEqual(r3, { content: 'x\n- [ ] task\n', status: ' ' });
});

test('cycleTaskAtLine sends cancelled and X to todo', () => {
	assert.equal(cycleTaskAtLine('- [-] a', 0)?.content, '- [ ] a');
	assert.equal(cycleTaskAtLine('- [X] a', 0)?.content, '- [ ] a');
});

test('cycleTaskAtLine handles nested and quoted tasks', () => {
	assert.equal(cycleTaskAtLine('- a\n\t- [ ] b', 1)?.content, '- a\n\t- [/] b');
	assert.equal(cycleTaskAtLine('> - [/] q', 0)?.content, '> - [x] q');
});

test('cycleTaskAtLine preserves CRLF', () => {
	const r = cycleTaskAtLine('a\r\n- [ ] b\r\nc\r\n', 1, '- [ ] b');
	assert.equal(r?.content, 'a\r\n- [/] b\r\nc\r\n');
});

test('cycleTaskAtLine refuses stale or invalid lines', () => {
	assert.equal(cycleTaskAtLine('- [ ] a\n', 0, '- [x] a'), null);
	assert.equal(cycleTaskAtLine('plain\n', 0), null);
	assert.equal(cycleTaskAtLine('- [ ] a', 5), null);
	assert.notEqual(cycleTaskAtLine('- [ ] a', 0, null), null);
});
