import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureDay } from './daily.ts';
import type { DailyOptions } from './daily.ts';
import { Disposer } from './disposer.ts';
import type { TimerHost } from './disposer.ts';
import { RETRY_DELAYS_MS, SingleFlight, ensureNote } from './ensure-note.ts';
import type { NoteAccess } from './ensure-note.ts';
import { FakeEditor } from './test-utils.ts';

const OPTS: DailyOptions = { sectionHeading: 'Daily', linkDates: true, carryOver: true, removeEmptyDays: true };
const compute = (text: string) => ensureDay(text, '2026-10-16', OPTS);

const BEFORE = '## Daily\n\n### [[2026-10-15]]\n- [x] done\n- [ ] open\n';
const AFTER = '## Daily\n\n### [[2026-10-15]]\n- [x] done\n\n### [[2026-10-16]]\n- [ ] open\n';

interface Fake {
	disk: string;
	editor: FakeEditor | null;
	sleeps: number[];
	writes: number;
	cancelled: boolean;
	access: NoteAccess;
	/** Hooks run on each sleep / inside processDisk. */
	onSleep?: (fake: Fake) => void;
	onProcess?: (fake: Fake) => void;
}

function fake(disk: string, editorText: string | null): Fake {
	const f: Fake = {
		disk,
		editor: editorText === null ? null : new FakeEditor(editorText),
		sleeps: [],
		writes: 0,
		cancelled: false,
		access: {
			cancelled: () => f.cancelled,
			editor: () => f.editor,
			readDisk: async () => f.disk,
			processDisk: async (fn) => {
				f.onProcess?.(f);
				const next = fn(f.disk);
				if (next !== f.disk) {
					f.disk = next;
					f.writes++;
				}
			},
			sleep: async (ms) => {
				f.sleeps.push(ms);
				f.onSleep?.(f);
			},
		},
	};
	return f;
}

test('no editing view: writes through vault.process', async () => {
	const f = fake(BEFORE, null);
	await ensureNote(f.access, compute);
	assert.equal(f.disk, AFTER);
	assert.equal(f.writes, 1);
	assert.deepEqual(f.sleeps, []);
});

test('no editing view and nothing to do: no write', async () => {
	const f = fake(AFTER, null);
	const result = await ensureNote(f.access, compute);
	assert.equal(result?.changed, false);
	assert.equal(f.writes, 0);
});

test('editor equal to disk: one minimal replaceRange in the editor, disk untouched', async () => {
	const f = fake(BEFORE, BEFORE);
	const result = await ensureNote(f.access, compute);
	assert.equal(f.editor?.text, AFTER);
	assert.equal(f.editor?.edits, 1);
	assert.equal(f.disk, BEFORE);
	assert.equal(f.writes, 0);
	assert.equal(result?.dayLine, 5);
});

test('editor equal to disk and nothing to do: no edit', async () => {
	const f = fake(AFTER, AFTER);
	const result = await ensureNote(f.access, compute);
	assert.equal(result?.changed, false);
	assert.equal(f.editor?.edits, 0);
});

test('editor not loaded yet (empty) is never edited; applies once it matches disk', async () => {
	const f = fake(BEFORE, '');
	f.onSleep = (x) => {
		if (x.editor) x.editor.text = x.disk;
	};
	await ensureNote(f.access, compute);
	assert.deepEqual(f.sleeps, [RETRY_DELAYS_MS[0]]);
	assert.equal(f.writes, 0);
	assert.equal(f.editor?.text, AFTER);
	assert.equal(f.editor?.edits, 1);
});

test('editor with unsaved changes: retries with backoff, gives up without touching anything', async () => {
	const f = fake(BEFORE, BEFORE + '- typing\n');
	const result = await ensureNote(f.access, compute);
	assert.equal(result, null);
	assert.deepEqual(f.sleeps, RETRY_DELAYS_MS);
	assert.equal(f.editor?.edits, 0);
	assert.equal(f.writes, 0);
});

test('editor saved during backoff: applied after the retry', async () => {
	const f = fake(BEFORE, BEFORE + '- typing\n');
	f.onSleep = (x) => {
		if (x.sleeps.length === 2 && x.editor) x.disk = x.editor.text;
	};
	await ensureNote(f.access, compute);
	assert.equal(f.writes, 0);
	assert.equal(f.sleeps.length, 2);
	assert.equal(f.editor?.text, '## Daily\n\n### [[2026-10-15]]\n- [x] done\n- typing\n\n### [[2026-10-16]]\n- [ ] open\n');
});

test('editing view opened while reading from disk: no disk write, retried via the editor', async () => {
	const f = fake(BEFORE, null);
	f.onProcess = (x) => {
		if (!x.editor) x.editor = new FakeEditor(x.disk);
	};
	await ensureNote(f.access, compute);
	assert.equal(f.writes, 0);
	assert.equal(f.editor?.text, AFTER);
});

test('blocked result is returned and nothing is written', async () => {
	const broken = '## Daily\n```\n- [ ] a\n';
	const viaDisk = fake(broken, null);
	assert.equal((await ensureNote(viaDisk.access, compute))?.blocked, 'unbalanced');
	assert.equal(viaDisk.writes, 0);
	const viaEditor = fake(broken, broken);
	assert.equal((await ensureNote(viaEditor.access, compute))?.blocked, 'unbalanced');
	assert.equal(viaEditor.editor?.edits, 0);
});

test('editor without final newline and CRLF disk text go through editor-style positions', async () => {
	const lf = '## Daily\n- [ ] a';
	const f = fake(lf, lf);
	await ensureNote(f.access, compute);
	assert.equal(f.editor?.text, '## Daily\n- [ ] a\n\n### [[2026-10-16]]\n');

	const crlf = BEFORE.replace(/\n/g, '\r\n');
	const g = fake(crlf, null);
	await ensureNote(g.access, compute);
	assert.equal(g.disk, AFTER.replace(/\n/g, '\r\n'));
});

test('LF editor over CRLF disk counts as equal; the edit is computed from the editor text', async () => {
	const f = fake(BEFORE.replace(/\n/g, '\r\n'), BEFORE);
	await ensureNote(f.access, compute);
	assert.deepEqual(f.sleeps, []);
	assert.equal(f.editor?.edits, 1);
	assert.equal(f.editor?.text, AFTER);
	assert.equal(f.writes, 0);
});

test('cancelled during a retry sleep: no edit afterwards', async () => {
	const f = fake(BEFORE, BEFORE + '- typing\n');
	f.onSleep = (x) => {
		if (x.editor) x.disk = x.editor.text;
		x.cancelled = true;
	};
	assert.equal(await ensureNote(f.access, compute), null);
	assert.equal(f.sleeps.length, 1);
	assert.equal(f.editor?.edits, 0);
});

test('cancelled before vault.process runs its callback: no disk write', async () => {
	const f = fake(BEFORE, null);
	f.onProcess = (x) => {
		x.cancelled = true;
	};
	assert.equal(await ensureNote(f.access, compute), null);
	assert.equal(f.writes, 0);
	assert.equal(f.disk, BEFORE);
});

/** Timers that only fire when `flush` is called. */
function manualTimers(): TimerHost & { pending: Map<number, () => void>; flush(): void } {
	let next = 1;
	const pending = new Map<number, () => void>();
	return {
		pending,
		setTimeout: (handler) => {
			pending.set(next, handler);
			return next++;
		},
		clearTimeout: (id) => {
			pending.delete(id);
		},
		flush() {
			const handlers = [...pending.values()];
			pending.clear();
			for (const handler of handlers) handler();
		},
	};
}

test('Disposer: dispose settles pending sleeps, clears timers, runs cleanups once', async () => {
	const timers = manualTimers();
	const disposer = new Disposer();
	let fired = 0;
	let cleaned = 0;
	disposer.timeout(timers, () => fired++, 0);
	disposer.add(() => cleaned++);
	const sleeping = disposer.sleep(timers, 1000);
	assert.equal(timers.pending.size, 2);
	disposer.dispose();
	disposer.dispose();
	await sleeping;
	assert.equal(timers.pending.size, 0);
	assert.equal(fired, 0);
	assert.equal(cleaned, 1);
	disposer.timeout(timers, () => fired++, 0);
	assert.equal(timers.pending.size, 0);
	await disposer.sleep(timers, 1000);
});

test('Disposer: fired timers unregister themselves', async () => {
	const timers = manualTimers();
	const disposer = new Disposer();
	let fired = 0;
	disposer.timeout(timers, () => fired++, 0);
	const sleeping = disposer.sleep(timers, 10);
	timers.flush();
	await sleeping;
	assert.equal(fired, 1);
	const remove = disposer.add(() => fired++);
	remove();
	disposer.dispose();
	assert.equal(fired, 1);
});

test('ensureNote with a Disposer: disposing during a retry sleep stops the run with no write', async () => {
	const timers = manualTimers();
	const disposer = new Disposer();
	const f = fake(BEFORE, BEFORE + '- typing\n');
	const access: NoteAccess = {
		...f.access,
		sleep: (ms) => disposer.sleep(timers, ms),
		cancelled: () => disposer.disposed,
	};
	const run = ensureNote(access, compute);
	await new Promise((resolve) => setImmediate(resolve));
	assert.equal(timers.pending.size, 1);
	if (f.editor) f.disk = f.editor.text;
	disposer.dispose();
	assert.equal(await run, null);
	assert.equal(f.editor?.edits, 0);
	assert.equal(f.writes, 0);
});

test('SingleFlight shares one in-flight promise per key', async () => {
	const flight = new SingleFlight<number>();
	let runs = 0;
	let release = (): void => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const job = async (): Promise<number> => {
		runs++;
		await gate;
		return runs;
	};
	const a = flight.run('note.md', job);
	const b = flight.run('note.md', job);
	const other = flight.run('other.md', job);
	assert.equal(a, b);
	release();
	assert.deepEqual(await Promise.all([a, b, other]), [2, 2, 2]);
	assert.equal(await flight.run('note.md', job), 3);
});

test('SingleFlight clears a failed run', async () => {
	const flight = new SingleFlight<string>();
	await assert.rejects(flight.run('k', async () => Promise.reject(new Error('boom'))));
	assert.equal(await flight.run('k', async () => 'ok'), 'ok');
});
