import type { Editor, EditorChange } from 'obsidian';
import { matchTask, nextStatus } from './status.ts';

/** Special value for `applyTaskStatus`: cycle each task to its next status. */
export const CYCLE = 'cycle';

/**
 * Line numbers covered by all selections/cursors, ascending and unique.
 * A multi-line selection ending at column 0 doesn't include its last line.
 */
export function getSelectedLines(editor: Editor): number[] {
	const lines = new Set<number>();
	for (const sel of editor.listSelections()) {
		const start = Math.min(sel.anchor.line, sel.head.line);
		let end = Math.max(sel.anchor.line, sel.head.line);
		const endPos = sel.anchor.line > sel.head.line ? sel.anchor : sel.head;
		if (end > start && endPos.ch === 0) end--;
		for (let line = start; line <= end; line++) lines.add(line);
	}
	return [...lines].sort((a, b) => a - b);
}

/** The subset of `lines` that are task lines. */
export function getTaskLines(editor: Editor, lines: number[]): number[] {
	const count = editor.lineCount();
	return lines.filter((line) => line >= 0 && line < count && matchTask(editor.getLine(line)) !== null);
}

/** Task lines touched by the current selections. */
export function getSelectedTaskLines(editor: Editor): number[] {
	return getTaskLines(editor, getSelectedLines(editor));
}

/**
 * Set the status of each task line in `lines`, or cycle it when `status` is `CYCLE`.
 * Non-task lines are ignored. All changes are applied as one transaction (one undo step).
 * Returns the number of changed lines.
 */
export function applyTaskStatus(editor: Editor, lines: number[], status: string): number {
	const changes: EditorChange[] = [];
	const count = editor.lineCount();
	for (const line of new Set(lines)) {
		if (line < 0 || line >= count) continue;
		const m = matchTask(editor.getLine(line));
		if (!m) continue;
		const next = status === CYCLE ? nextStatus(m.status) : status;
		if (next === m.status) continue;
		changes.push({ from: { line, ch: m.ch }, to: { line, ch: m.ch + 1 }, text: next });
	}
	if (changes.length > 0) editor.transaction({ changes });
	return changes.length;
}
