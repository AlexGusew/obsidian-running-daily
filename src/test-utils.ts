/**
 * Test helpers (not bundled): an editor-style text model where positions count lines split on
 * `\n` or `\r\n` and `ch` never includes `\r`, like Obsidian's `Editor`.
 */

import type { LinePosition } from './daily.ts';

export function toOffset(text: string, pos: LinePosition): number {
	const starts = [0];
	const re = /\r?\n/g;
	for (let m = re.exec(text); m; m = re.exec(text)) starts.push(m.index + m[0].length);
	const start = starts[pos.line];
	if (start === undefined) throw new Error(`line ${pos.line} out of range`);
	const lineEnd = pos.line + 1 < starts.length ? text.slice(start).search(/\r?\n/) + start : text.length;
	if (start + pos.ch > lineEnd) throw new Error(`ch ${pos.ch} out of range on line ${pos.line}`);
	return start + pos.ch;
}

export function replaceRange(text: string, insert: string, from: LinePosition, to: LinePosition = from): string {
	const a = toOffset(text, from);
	const b = toOffset(text, to);
	if (a > b) throw new Error('from after to');
	return text.slice(0, a) + insert + text.slice(b);
}

/** Minimal stand-in for Obsidian's `Editor`. */
export class FakeEditor {
	text: string;
	edits = 0;

	constructor(text: string) {
		this.text = text;
	}

	getValue(): string {
		return this.text;
	}

	replaceRange(insert: string, from: LinePosition, to?: LinePosition): void {
		this.text = replaceRange(this.text, insert, from, to);
		this.edits++;
	}
}
