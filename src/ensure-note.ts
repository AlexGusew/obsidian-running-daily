/**
 * How edits reach the running daily note (SPEC §5b "Editor vs disk", §5c). Pure: Obsidian objects
 * are passed in through `NoteAccess`, so the decision logic is unit tested.
 */

import { diffLines } from './daily.ts';
import type { EnsureDayResult, LinePosition } from './daily.ts';

/** The part of Obsidian's `Editor` used here. */
export interface EditorLike {
	getValue(): string;
	replaceRange(text: string, from: LinePosition, to?: LinePosition): void;
}

export interface NoteAccess {
	/** Editor of a Live Preview / Source view showing the note, or null when none does. */
	editor(): EditorLike | null;
	/** Current text on disk. */
	readDisk(): Promise<string>;
	/** Atomic read-modify-write on disk (`vault.process`). */
	processDisk(fn: (data: string) => string): Promise<void>;
	/** Resolves after `ms`, or early once cancelled. */
	sleep(ms: number): Promise<void>;
	/** True once the plugin is unloading: nothing may be written any more. */
	cancelled(): boolean;
}

/** Waits between attempts while an open editor differs from disk (unsaved or still loading). */
export const RETRY_DELAYS_MS = [200, 500, 1000, 2000, 3000];

const lf = (text: string): string => text.replace(/\r\n/g, '\n');

/**
 * Run `compute` on the note and write its result:
 * - an editing view shows the note: only when its text equals the disk text (line endings
 *   normalised), checked synchronously right before applying one minimal `replaceRange` computed
 *   from the editor text; otherwise retry after a delay;
 * - no editing view: `vault.process`, unless an editing view appeared meanwhile (then retry).
 * Returns null when every attempt was deferred or when cancelled. Blocked results are returned
 * as-is (nothing written).
 */
export async function ensureNote(
	access: NoteAccess,
	compute: (text: string) => EnsureDayResult,
	delays: readonly number[] = RETRY_DELAYS_MS,
): Promise<EnsureDayResult | null> {
	for (let attempt = 0; ; attempt++) {
		if (access.cancelled()) return null;
		if (access.editor() === null) {
			const holder: { result?: EnsureDayResult } = {};
			await access.processDisk((data) => {
				if (access.cancelled() || access.editor() !== null) return data;
				const result = compute(data);
				holder.result = result;
				return result.changed ? result.content : data;
			});
			if (access.cancelled()) return null;
			if (holder.result) return holder.result;
		} else {
			const disk = await access.readDisk();
			if (access.cancelled()) return null;
			const editor = access.editor();
			const text = editor?.getValue();
			if (editor && text !== undefined && lf(text) === lf(disk)) {
				const result = compute(text);
				const diff = result.changed ? diffLines(text, result.content) : null;
				if (diff) editor.replaceRange(diff.text, diff.from, diff.to);
				return result;
			}
		}
		const delay = delays[attempt];
		if (delay === undefined) return null;
		await access.sleep(delay);
	}
}

/** One in-flight promise per key; overlapping callers share it. */
export class SingleFlight<T> {
	private running = new Map<string, Promise<T>>();

	run(key: string, fn: () => Promise<T>): Promise<T> {
		const existing = this.running.get(key);
		if (existing) return existing;
		const promise = fn().finally(() => this.running.delete(key));
		this.running.set(key, promise);
		return promise;
	}
}
