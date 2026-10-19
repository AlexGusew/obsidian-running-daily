import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayLabel, diffLines, ensureDay, findDay } from './daily.ts';
import type { DailyOptions } from './daily.ts';
import { replaceRange } from './test-utils.ts';

const OPTS: DailyOptions = {
	sectionHeading: 'Daily',
	linkDates: true,
	carryOver: true,
	removeEmptyDays: true,
};

const TODAY = '2026-10-16';

function md(...lines: string[]): string {
	return lines.join('\n') + '\n';
}

function lineOf(content: string, index: number): string {
	return content.split(/\r?\n/)[index] ?? '';
}

test('existing day: unchanged, returns its block', () => {
	const content = md(
		'## Daily',
		'',
		'### [[2026-10-15]]',
		'- [x] a',
		'',
		'### [[2026-10-16]]',
		'- [ ] b',
		'\t- [ ] c',
		'',
		'',
	);
	const r = ensureDay(content, TODAY, OPTS);
	assert.equal(r.changed, false);
	assert.equal(r.content, content);
	assert.equal(r.dayLine, 5);
	assert.equal(r.dayEndLine, 7);
});

test('existing empty day: dayEndLine is the heading line', () => {
	const content = md('## Daily', '', '### [[2026-10-16]]', '', '## Later');
	const r = ensureDay(content, TODAY, OPTS);
	assert.equal(r.changed, false);
	assert.equal(r.dayLine, 2);
	assert.equal(r.dayEndLine, 2);
});

test('existing day matched in plain form, alias form and with trailing colon', () => {
	for (const h of ['### 2026-10-16', '### [[2026-10-16|Friday]]', '### [[2026-10-16]]:', '### 2026-10-16:', '### [[2026-10-16|Fri]] :']) {
		const content = md('## Daily', '', h, '- [ ] a');
		const r = ensureDay(content, TODAY, OPTS);
		assert.equal(r.changed, false, h);
		assert.equal(r.dayLine, 2, h);
		assert.equal(r.dayEndLine, 3, h);
	}
});

test('dayLabel reduces links and trailing colons', () => {
	assert.equal(dayLabel('[[2026-10-16]]'), '2026-10-16');
	assert.equal(dayLabel('[[2026-10-16|Friday]]'), '2026-10-16');
	assert.equal(dayLabel(' [[2026-10-16]]: '), '2026-10-16');
	assert.equal(dayLabel('2026-10-16:'), '2026-10-16');
	assert.equal(dayLabel('2026-10-16'), '2026-10-16');
	assert.equal(dayLabel('[[a]] and [[b]]'), '[[a]] and [[b]]');
});

test('section heading matching ignores case and trailing colon', () => {
	const content = md('## daily:', '', '### [[2026-10-16]]');
	const r = ensureDay(content, TODAY, OPTS);
	assert.equal(r.changed, false);
	assert.equal(r.dayLine, 2);
});

test('creates today in an empty section', () => {
	const r = ensureDay(md('## Backlog', '- [ ] x', '', '## Daily'), TODAY, OPTS);
	assert.equal(r.changed, true);
	assert.equal(r.content, md('## Backlog', '- [ ] x', '', '## Daily', '', '### [[2026-10-16]]'));
	assert.equal(r.dayLine, 5);
	assert.equal(r.dayEndLine, 5);
	assert.equal(lineOf(r.content, r.dayLine), '### [[2026-10-16]]');
});

test('creates today with no previous day and trims trailing blank lines', () => {
	const r = ensureDay('## Daily\n\n\n\n', TODAY, OPTS);
	assert.equal(r.content, md('## Daily', '', '### [[2026-10-16]]'));
});

test('carry-over moves unfinished top-level tasks with nested children, in order', () => {
	const content = md(
		'## Daily',
		'',
		'### [[2026-10-15]]',
		'- [ ] first',
		'\t- note under first',
		'\t- [x] done child',
		'- [x] done thing',
		'- [/] second',
		'\t- [ ] sub',
		'\t\t- deeper',
	);
	const r = ensureDay(content, TODAY, OPTS);
	assert.equal(
		r.content,
		md(
			'## Daily',
			'',
			'### [[2026-10-15]]',
			'- [x] done thing',
			'',
			'### [[2026-10-16]]',
			'- [ ] first',
			'\t- note under first',
			'\t- [x] done child',
			'- [/] second',
			'\t- [ ] sub',
			'\t\t- deeper',
		),
	);
	assert.equal(r.dayLine, 5);
	assert.equal(r.dayEndLine, 11);
	assert.equal(lineOf(r.content, r.dayEndLine), '\t\t- deeper');
});

test('subtree ends at a blank line', () => {
	const content = md('## Daily', '', '### [[2026-10-15]]', '- [ ] a', '', '\t- detached child');
	const r = ensureDay(content, TODAY, OPTS);
	assert.equal(
		r.content,
		md('## Daily', '', '### [[2026-10-15]]', '', '\t- detached child', '', '### [[2026-10-16]]', '- [ ] a'),
	);
});

test('done or cancelled parent stays with its unfinished children', () => {
	const content = md(
		'## Daily',
		'',
		'### [[2026-10-15]]',
		'- [x] done parent',
		'\t- [ ] open child',
		'- [-] cancelled parent',
		'\t- [/] open child 2',
		'- [X] upper done',
	);
	const r = ensureDay(content, TODAY, OPTS);
	assert.equal(r.content, content.replace(/\n$/, '') + '\n\n### [[2026-10-16]]\n');
	assert.equal(r.dayEndLine, r.dayLine);
});

test('plain bullets and their children stay', () => {
	const content = md(
		'## Daily',
		'',
		'### [[2026-10-15]]',
		'- plain note',
		'\t- [ ] open task under note',
		'- [ ] move me',
		'Some paragraph',
	);
	const r = ensureDay(content, TODAY, OPTS);
	assert.equal(
		r.content,
		md(
			'## Daily',
			'',
			'### [[2026-10-15]]',
			'- plain note',
			'\t- [ ] open task under note',
			'Some paragraph',
			'',
			'### [[2026-10-16]]',
			'- [ ] move me',
		),
	);
});

test('removes previous day when it becomes empty', () => {
	const content = md(
		'## Daily',
		'',
		'### [[2026-10-14]]',
		'- [x] old',
		'',
		'### [[2026-10-15]]',
		'- [ ] a',
		'- [/] b',
		'',
	);
	const r = ensureDay(content, TODAY, OPTS);
	assert.equal(
		r.content,
		md('## Daily', '', '### [[2026-10-14]]', '- [x] old', '', '### [[2026-10-16]]', '- [ ] a', '- [/] b'),
	);
	assert.equal(r.dayLine, 5);
	assert.equal(r.dayEndLine, 7);
});

test('removes an already empty previous day', () => {
	const content = md('## Daily', '', '### [[2026-10-14]]', '- [x] old', '', '### [[2026-10-15]]', '');
	const r = ensureDay(content, TODAY, OPTS);
	assert.equal(r.content, md('## Daily', '', '### [[2026-10-14]]', '- [x] old', '', '### [[2026-10-16]]'));
});

test('keeps the empty previous day when removeEmptyDays is off', () => {
	const content = md('## Daily', '', '### [[2026-10-15]]', '- [ ] a');
	const r = ensureDay(content, TODAY, { ...OPTS, removeEmptyDays: false });
	assert.equal(r.content, md('## Daily', '', '### [[2026-10-15]]', '', '### [[2026-10-16]]', '- [ ] a'));
});

test('keeps non-empty previous day', () => {
	const content = md('## Daily', '', '### [[2026-10-15]]', '- [x] done', '- [ ] a');
	const r = ensureDay(content, TODAY, OPTS);
	assert.equal(
		r.content,
		md('## Daily', '', '### [[2026-10-15]]', '- [x] done', '', '### [[2026-10-16]]', '- [ ] a'),
	);
});

test('carryOver off leaves previous day untouched', () => {
	const content = md('## Daily', '', '### [[2026-10-15]]', '- [ ] a');
	const r = ensureDay(content, TODAY, { ...OPTS, carryOver: false });
	assert.equal(r.content, md('## Daily', '', '### [[2026-10-15]]', '- [ ] a', '', '### [[2026-10-16]]'));
	assert.equal(r.dayLine, 5);
	assert.equal(r.dayEndLine, 5);
});

test('previous day is the last day heading by position', () => {
	const content = md('## Daily', '', '### [[2026-10-15]]', '- [ ] newer', '', '### [[2026-10-01]]', '- [ ] older');
	const r = ensureDay(content, TODAY, OPTS);
	assert.equal(
		r.content,
		md('## Daily', '', '### [[2026-10-15]]', '- [ ] newer', '', '### [[2026-10-16]]', '- [ ] older'),
	);
});

test('missing section is appended at EOF', () => {
	const r = ensureDay(md('# Notes', 'text', '', ''), TODAY, OPTS);
	assert.equal(r.changed, true);
	assert.equal(r.content, md('# Notes', 'text', '', '## Daily', '', '### [[2026-10-16]]'));
	assert.equal(r.dayLine, 5);
});

test('missing section in empty file and file without trailing newline', () => {
	assert.equal(ensureDay('', TODAY, OPTS).content, md('## Daily', '', '### [[2026-10-16]]'));
	assert.equal(ensureDay('text', TODAY, OPTS).content, md('text', '', '## Daily', '', '### [[2026-10-16]]'));
});

test('section followed by another heading keeps one blank line before it', () => {
	const content = md(
		'## Daily',
		'',
		'### [[2026-10-15]]',
		'- [x] done',
		'- [ ] open',
		'',
		'',
		'## Archive',
		'- old',
	);
	const r = ensureDay(content, TODAY, OPTS);
	assert.equal(
		r.content,
		md(
			'## Daily',
			'',
			'### [[2026-10-15]]',
			'- [x] done',
			'',
			'### [[2026-10-16]]',
			'- [ ] open',
			'',
			'## Archive',
			'- old',
		),
	);
	assert.equal(r.dayLine, 5);
	assert.equal(r.dayEndLine, 6);
});

test('section followed directly by another heading', () => {
	const content = md('## Daily', '## Archive');
	const r = ensureDay(content, TODAY, OPTS);
	assert.equal(r.content, md('## Daily', '', '### [[2026-10-16]]', '', '## Archive'));
});

test('level 1 section uses level 2 days; days outside the section are ignored', () => {
	const content = md('# Daily', '', '## [[2026-10-15]]', '- [ ] a', '', '# Other', '## [[2026-10-16]]');
	const r = ensureDay(content, TODAY, OPTS);
	assert.equal(r.changed, true);
	assert.equal(
		r.content,
		md('# Daily', '', '## [[2026-10-16]]', '- [ ] a', '', '# Other', '## [[2026-10-16]]'),
	);
	assert.equal(r.dayLine, 2);
});

test('CRLF line endings are preserved', () => {
	const content = ['## Daily', '', '### [[2026-10-15]]', '- [x] done', '- [ ] open', ''].join('\r\n');
	const r = ensureDay(content, TODAY, OPTS);
	assert.equal(
		r.content,
		['## Daily', '', '### [[2026-10-15]]', '- [x] done', '', '### [[2026-10-16]]', '- [ ] open', ''].join('\r\n'),
	);
	assert.equal(r.dayLine, 5);
	assert.equal(r.dayEndLine, 6);
});

test('CRLF existing day is found', () => {
	const content = ['## Daily', '', '### [[2026-10-16]]', '- [ ] a', ''].join('\r\n');
	const r = ensureDay(content, TODAY, OPTS);
	assert.equal(r.changed, false);
	assert.equal(r.dayEndLine, 3);
});

test('linkDates false writes a plain heading', () => {
	const r = ensureDay(md('## Daily', '', '### 2026-10-15', '- [ ] a'), TODAY, { ...OPTS, linkDates: false });
	assert.equal(r.content, md('## Daily', '', '### 2026-10-16', '- [ ] a'));
});

test('linked existing heading matches when linkDates is false and vice versa', () => {
	assert.equal(ensureDay(md('## Daily', '### [[2026-10-16]]'), TODAY, { ...OPTS, linkDates: false }).changed, false);
	assert.equal(ensureDay(md('## Daily', '### 2026-10-16'), TODAY, OPTS).changed, false);
});

test('ignores headings in front matter and code fences', () => {
	const content = md('---', '# not a heading', '---', '## Daily', '', '```', '### [[2026-10-16]]', '```');
	const r = ensureDay(content, TODAY, OPTS);
	assert.equal(r.changed, true);
	assert.equal(r.dayLine, 9);
});

test('full example from the spec', () => {
	const content = md(
		'## Backlog',
		'- [ ] Something not scheduled',
		'',
		'## Daily',
		'',
		'### [[2026-10-15]]',
		'- [x] Done thing',
		'- [-] Cancelled thing',
		'- Plain note bullet',
		'\t- nested note',
		'- [/] In progress thing',
		'\t- [ ] sub task',
		'- [ ] Todo thing',
	);
	const r = ensureDay(content, TODAY, OPTS);
	assert.equal(
		r.content,
		md(
			'## Backlog',
			'- [ ] Something not scheduled',
			'',
			'## Daily',
			'',
			'### [[2026-10-15]]',
			'- [x] Done thing',
			'- [-] Cancelled thing',
			'- Plain note bullet',
			'\t- nested note',
			'',
			'### [[2026-10-16]]',
			'- [/] In progress thing',
			'\t- [ ] sub task',
			'- [ ] Todo thing',
		),
	);
	assert.equal(r.dayLine, 11);
	assert.equal(r.dayEndLine, 14);
});

function applyDiff(oldText: string, newText: string): string {
	const d = diffLines(oldText, newText);
	if (!d) return oldText;
	assert.equal(d.from.ch, 0);
	return replaceRange(oldText, d.text, d.from, d.to);
}

test('diffLines returns null for equal texts', () => {
	assert.equal(diffLines('a\nb\n', 'a\nb\n'), null);
	assert.equal(diffLines('', ''), null);
});

test('diffLines: minimal range for an insertion', () => {
	const d = diffLines('a\nb\nc\n', 'a\nb\nX\nc\n');
	assert.deepEqual(d, { from: { line: 2, ch: 0 }, to: { line: 2, ch: 0 }, text: 'X\n' });
});

test('diffLines: minimal range for a replacement and a deletion', () => {
	assert.deepEqual(diffLines('a\nb\nc\n', 'a\nB\nc\n'), { from: { line: 1, ch: 0 }, to: { line: 2, ch: 0 }, text: 'B\n' });
	assert.deepEqual(diffLines('a\nb\nc\n', 'a\nc\n'), { from: { line: 1, ch: 0 }, to: { line: 2, ch: 0 }, text: '' });
});

test('diffLines: change in the last line without trailing newline', () => {
	const d = diffLines('a\nb', 'a\nc');
	assert.deepEqual(d, { from: { line: 1, ch: 0 }, to: { line: 1, ch: 1 }, text: 'c' });
});

test('diffLines round-trips on varied inputs', () => {
	const cases: Array<[string, string]> = [
		['', 'a\n'],
		['a', 'a\nb\n'],
		['a\n', 'b\n'],
		['x', ''],
		['a\na\na\n', 'a\na\n'],
		['a\na\n', 'a\na\na\n'],
		['a\nb\n', 'b\n'],
		['a\r\nb\r\n', 'a\r\nc\r\nb\r\n'],
		['line', 'line\n'],
		['line\n', 'line'],
	];
	for (const [a, b] of cases) assert.equal(applyDiff(a, b), b, JSON.stringify([a, b]));
});

test('diffLines round-trips ensureDay edits', () => {
	const inputs = [
		md('## Daily', '', '### [[2026-10-15]]', '- [x] done', '- [ ] open', '\t- child', '', '## Archive'),
		md('# Notes'),
		'',
		md('## Daily', '', '### [[2026-10-15]]', '- [ ] a'),
	];
	for (const input of inputs) {
		const r = ensureDay(input, TODAY, OPTS);
		assert.equal(applyDiff(input, r.content), r.content);
	}
});

// --- §5b: code blocks, nested headings, refusal, blank lines outside the section ---

test('carry-over never moves task-looking lines inside fenced code', () => {
	const content = md(
		'## Daily',
		'',
		'### [[2026-10-15]]',
		'```',
		'- [ ] in backticks',
		'```',
		'~~~md',
		'- [/] in tildes',
		'~~~',
		'- [ ] real',
	);
	const r = ensureDay(content, TODAY, OPTS);
	assert.equal(
		r.content,
		md(
			'## Daily',
			'',
			'### [[2026-10-15]]',
			'```',
			'- [ ] in backticks',
			'```',
			'~~~md',
			'- [/] in tildes',
			'~~~',
			'',
			'### [[2026-10-16]]',
			'- [ ] real',
		),
	);
});

test('a fence opened inside a carried subtree moves whole, even with column-0 content', () => {
	const content = md('## Daily', '', '### [[2026-10-15]]', '- [ ] task', '  ```', 'col 0 code', '', '  ```', '- [x] done');
	const r = ensureDay(content, TODAY, OPTS);
	assert.equal(
		r.content,
		md('## Daily', '', '### [[2026-10-15]]', '- [x] done', '', '### [[2026-10-16]]', '- [ ] task', '  ```', 'col 0 code', '', '  ```'),
	);
	assert.equal(ensureDay(r.content, TODAY, OPTS).changed, false);
});

test('a column-0 fence right after an open task is not part of its subtree', () => {
	const content = md('## Daily', '', '### [[2026-10-15]]', '- [ ] real task', '```md', '- [ ] in code', '```');
	const r = ensureDay(content, TODAY, OPTS);
	assert.equal(
		r.content,
		md('## Daily', '', '### [[2026-10-15]]', '```md', '- [ ] in code', '```', '', '### [[2026-10-16]]', '- [ ] real task'),
	);
	assert.equal(ensureDay(r.content, TODAY, OPTS).changed, false);
});

test('headings nested in list items are content, not headings', () => {
	for (const nested of ['  ## nested heading', '   ### nested', '\t## nested', '    #### four spaces']) {
		const content = md('## Daily', '', '### [[2026-10-15]]', '- [ ] parent', nested, '  child');
		const r = ensureDay(content, TODAY, OPTS);
		assert.equal(
			r.content,
			md('## Daily', '', '### [[2026-10-16]]', '- [ ] parent', nested, '  child'),
			JSON.stringify(nested),
		);
	}
});

test('headings nested in ordered list items are content', () => {
	const content = md('## Daily', '', '### [[2026-10-15]]', '1. [ ] parent', '   ## nested', '2. [x] done');
	const r = ensureDay(content, TODAY, OPTS);
	assert.equal(
		r.content,
		md('## Daily', '', '### [[2026-10-15]]', '2. [x] done', '', '### [[2026-10-16]]', '1. [ ] parent', '   ## nested'),
	);
});

test('indented today heading or section heading does not count', () => {
	const r1 = ensureDay(md('## Daily', '', '### [[2026-10-15]]', '- [x] a', '  ### [[2026-10-16]]'), TODAY, OPTS);
	assert.equal(r1.changed, true);
	assert.equal(lineOf(r1.content, r1.dayLine), '### [[2026-10-16]]');
	const r2 = ensureDay(md('  ## Daily', 'text'), TODAY, OPTS);
	assert.equal(r2.content, md('  ## Daily', 'text', '', '## Daily', '', '### [[2026-10-16]]'));
});

test('unterminated front matter is refused', () => {
	const content = md('---', 'title: x', '## Daily', '### [[2026-10-15]]', '- [ ] a');
	const r = ensureDay(content, TODAY, OPTS);
	assert.deepEqual(r, { content, changed: false, dayLine: -1, dayEndLine: -1, blocked: 'unbalanced' });
});

test('unclosed fence anywhere is refused', () => {
	for (const content of [
		md('## Daily', '', '### [[2026-10-15]]', '- [ ] a', '```', '- [ ] code'),
		md('## Backlog', '~~~', 'x', '## Daily', '### [[2026-10-15]]'),
		md('## Daily', '```', '~~~'),
	]) {
		const r = ensureDay(content, TODAY, OPTS);
		assert.equal(r.blocked, 'unbalanced');
		assert.equal(r.changed, false);
		assert.equal(r.content, content);
		assert.equal(r.dayLine, -1);
	}
});

test('a closed front matter is fine', () => {
	const content = md('---', 'title: x', '# not a heading', '---', '## Daily');
	const r = ensureDay(content, TODAY, OPTS);
	assert.equal(r.blocked, undefined);
	assert.equal(r.content, md('---', 'title: x', '# not a heading', '---', '## Daily', '', '### [[2026-10-16]]'));
});

test('level 6 daily section is refused; level 5 uses level 6 days', () => {
	const six = md('###### Daily', '- x');
	assert.deepEqual(ensureDay(six, TODAY, OPTS), {
		content: six,
		changed: false,
		dayLine: -1,
		dayEndLine: -1,
		blocked: 'section-level',
	});
	const five = ensureDay(md('##### Daily'), TODAY, OPTS);
	assert.equal(five.content, md('##### Daily', '', '###### [[2026-10-16]]'));
	assert.equal(ensureDay(five.content, TODAY, OPTS).changed, false);
});

test('ensureDay is idempotent', () => {
	const inputs = [
		'',
		'text',
		md('# Notes', '', ''),
		md('## Daily', '', '### [[2026-10-15]]', '- [ ] a', '\t- b', '- [x] c', '', '## Archive', '- old'),
		md('## Daily', '### [[2026-10-15]]', '- [ ] a'),
		['## Daily', '', '### [[2026-10-15]]', '- [/] a', ''].join('\r\n'),
		md('---', 'a: 1', '---', '## Daily', '```', '- [ ] code', '```'),
	];
	for (const input of inputs) {
		const first = ensureDay(input, TODAY, OPTS);
		const second = ensureDay(first.content, TODAY, OPTS);
		assert.equal(second.changed, false, JSON.stringify(input));
		assert.equal(second.content, first.content);
		assert.equal(second.dayLine, first.dayLine);
		assert.equal(second.dayEndLine, first.dayEndLine);
	}
});

test('non-date day heading like [[Running daily]] is kept; the last heading is the previous day', () => {
	const content = md('## Daily', '', '### [[Running daily]]', '- note', '- [ ] stays', '', '### [[2026-10-15]]', '- [ ] a');
	const r = ensureDay(content, TODAY, OPTS);
	assert.equal(
		r.content,
		md('## Daily', '', '### [[Running daily]]', '- note', '- [ ] stays', '', '### [[2026-10-16]]', '- [ ] a'),
	);
	const only = md('## Daily', '', '### [[Running daily]]', '- App template is ready');
	assert.equal(ensureDay(only, TODAY, OPTS).content, only.replace(/\n$/, '') + '\n\n### [[2026-10-16]]\n');
});

test('duplicate today headings: first wins, nothing changes', () => {
	const content = md('## Daily', '', '### [[2026-10-16]]', '- [ ] a', '', '### 2026-10-16', '- [ ] b');
	const r = ensureDay(content, TODAY, OPTS);
	assert.equal(r.changed, false);
	assert.equal(r.content, content);
	assert.equal(r.dayLine, 2);
	assert.equal(r.dayEndLine, 3);
});

test('another actor already created today: nothing changes', () => {
	const content = md('## Daily', '', '### [[2026-10-15]]', '- [x] a', '', '### [[2026-10-16]]', '- [ ] moved', '', '## Archive');
	const r = ensureDay(content, TODAY, OPTS);
	assert.equal(r.changed, false);
	assert.equal(r.content, content);
	assert.equal(r.dayLine, 5);
	assert.equal(r.dayEndLine, 6);
});

test('blank lines outside the daily section are untouched', () => {
	const content = '# Top\n\n\n\n## Daily\n\n### [[2026-10-15]]\n- [ ] a\n\n\n\n## Archive\n- old\n\n\n';
	const r = ensureDay(content, TODAY, OPTS);
	assert.equal(r.content, '# Top\n\n\n\n## Daily\n\n### [[2026-10-16]]\n- [ ] a\n\n## Archive\n- old\n\n\n');
});

test('missing final newline is kept when the section is not at EOF, added when it is', () => {
	assert.equal(
		ensureDay('## Daily\n## Archive\n- old', TODAY, OPTS).content,
		'## Daily\n\n### [[2026-10-16]]\n\n## Archive\n- old',
	);
	assert.equal(ensureDay('## Daily\n- [x] a', TODAY, OPTS).content, '## Daily\n- [x] a\n\n### [[2026-10-16]]\n');
});

test('diffLines gives editor-style positions for CRLF and missing final newline', () => {
	const crlf = ['## Daily', '', '### [[2026-10-15]]', '- [x] done', '- [ ] open'].join('\r\n');
	const r = ensureDay(crlf, TODAY, OPTS);
	const d = diffLines(crlf, r.content);
	assert.ok(d);
	// The last old line has no `\r`; the end position is its plain length.
	assert.deepEqual(d.to, { line: 4, ch: '- [ ] open'.length });
	assert.equal(replaceRange(crlf, d.text, d.from, d.to), r.content);

	const lf = '## Daily\n- [ ] a';
	const r2 = ensureDay(lf, TODAY, OPTS);
	const d2 = diffLines(lf, r2.content);
	assert.ok(d2);
	assert.equal(replaceRange(lf, d2.text, d2.from, d2.to), r2.content);
});

test('findDay locates today in the text as shown, or null when absent or refused', () => {
	const shown = md('## Daily', '', '### [[2026-10-15]]', '- [x] a', '', '### [[2026-10-16]]', '- [ ] b', '', '## Later');
	assert.deepEqual(findDay(shown, TODAY, OPTS), { dayLine: 5, dayEndLine: 6 });
	assert.equal(findDay(md('## Daily', '', '### [[2026-10-15]]'), TODAY, OPTS), null);
	assert.equal(findDay(md('## Daily', '```', '### [[2026-10-16]]'), TODAY, OPTS), null);
});
