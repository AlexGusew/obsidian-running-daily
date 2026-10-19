import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	getTaskStatus,
	isTaskLine,
	matchTask,
	nextStatus,
	normalizeStatus,
	setTaskStatus,
} from './status.ts';

test('nextStatus cycles todo → in progress → done → todo', () => {
	assert.equal(nextStatus(' '), '/');
	assert.equal(nextStatus('/'), 'x');
	assert.equal(nextStatus('x'), ' ');
});

test('nextStatus sends cancelled, X and unknown chars to todo', () => {
	assert.equal(nextStatus('-'), ' ');
	assert.equal(nextStatus('X'), ' ');
	assert.equal(nextStatus('?'), ' ');
	assert.equal(nextStatus('>'), ' ');
});

test('getTaskStatus parses task lines', () => {
	assert.equal(getTaskStatus('- [ ] todo'), ' ');
	assert.equal(getTaskStatus('- [/] doing'), '/');
	assert.equal(getTaskStatus('- [x] done'), 'x');
	assert.equal(getTaskStatus('- [X] done'), 'X');
	assert.equal(getTaskStatus('- [-] cancelled'), '-');
	assert.equal(getTaskStatus('* [ ] star'), ' ');
	assert.equal(getTaskStatus('+ [/] plus'), '/');
	assert.equal(getTaskStatus('1. [x] ordered'), 'x');
	assert.equal(getTaskStatus('12) [ ] ordered paren'), ' ');
	assert.equal(getTaskStatus('\t- [ ] nested'), ' ');
	assert.equal(getTaskStatus('    - [/] spaces'), '/');
	assert.equal(getTaskStatus('> - [x] quoted'), 'x');
	assert.equal(getTaskStatus('> > - [-] double quoted'), '-');
	assert.equal(getTaskStatus('- [ ]'), ' ');
});

test('getTaskStatus returns null for non-task lines', () => {
	assert.equal(getTaskStatus('plain text'), null);
	assert.equal(getTaskStatus('- plain bullet'), null);
	assert.equal(getTaskStatus('- [] empty brackets'), null);
	assert.equal(getTaskStatus('-[ ] no space'), null);
	assert.equal(getTaskStatus('[ ] no marker'), null);
	assert.equal(getTaskStatus('### [[2026-10-16]]'), null);
	assert.equal(getTaskStatus(''), null);
	assert.equal(isTaskLine('- [ ] x'), true);
	assert.equal(isTaskLine('- x'), false);
});

test('matchTask reports the status char offset', () => {
	assert.deepEqual(matchTask('- [ ] a'), { status: ' ', ch: 3 });
	assert.deepEqual(matchTask('\t\t1. [/] a'), { status: '/', ch: 6 });
	assert.deepEqual(matchTask('> - [x] a'), { status: 'x', ch: 5 });
	assert.equal(matchTask('nope'), null);
});

test('setTaskStatus replaces only the status char', () => {
	assert.equal(setTaskStatus('- [ ] todo [ ] keep', '/'), '- [/] todo [ ] keep');
	assert.equal(setTaskStatus('\t- [/] nested', 'x'), '\t- [x] nested');
	assert.equal(setTaskStatus('> 1. [x] quoted', '-'), '> 1. [-] quoted');
	assert.equal(setTaskStatus('- [-] back', ' '), '- [ ] back');
});

test('setTaskStatus leaves non-task lines unchanged', () => {
	assert.equal(setTaskStatus('- plain', 'x'), '- plain');
	assert.equal(setTaskStatus('text [ ] here', 'x'), 'text [ ] here');
});

test('normalizeStatus maps known chars', () => {
	assert.equal(normalizeStatus(' '), ' ');
	assert.equal(normalizeStatus('/'), '/');
	assert.equal(normalizeStatus('x'), 'x');
	assert.equal(normalizeStatus('X'), 'x');
	assert.equal(normalizeStatus('-'), '-');
	assert.equal(normalizeStatus('?'), null);
});
