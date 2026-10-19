/**
 * Task status helpers. Pure functions, no Obsidian imports.
 *
 * A task line is a list item with a checkbox, optionally blockquoted and indented:
 * `- [ ] text`, `\t* [x] text`, `> 1. [/] text`.
 */

export const STATUS_TODO = ' ';
export const STATUS_IN_PROGRESS = '/';
export const STATUS_DONE = 'x';
export const STATUS_CANCELLED = '-';

export type TaskStatus =
	| typeof STATUS_TODO
	| typeof STATUS_IN_PROGRESS
	| typeof STATUS_DONE
	| typeof STATUS_CANCELLED;

/** Group 1: everything up to and including `[`, group 2: status char, group 3: `]`. */
export const TASK_LINE_RE = /^(\s*(?:>\s?)*(?:[-*+]|\d+[.)])\s+\[)([^\]])(\])/;

export interface TaskMatch {
	/** Status character inside the brackets. */
	status: string;
	/** Character offset of the status character in the line. */
	ch: number;
}

/** Parse a task line. Returns null when the line is not a task. */
export function matchTask(line: string): TaskMatch | null {
	const m = TASK_LINE_RE.exec(line);
	if (!m) return null;
	const prefix = m[1] ?? '';
	return { status: m[2] ?? '', ch: prefix.length };
}

export function isTaskLine(line: string): boolean {
	return TASK_LINE_RE.test(line);
}

/** Status character of a task line, or null when the line is not a task. */
export function getTaskStatus(line: string): string | null {
	const m = matchTask(line);
	return m ? m.status : null;
}

/** Replace the status character of a task line. Non-task lines are returned unchanged. */
export function setTaskStatus(line: string, status: string): string {
	const m = matchTask(line);
	if (!m) return line;
	return line.slice(0, m.ch) + status + line.slice(m.ch + 1);
}

/** Cycle order: todo → in progress → done → todo. Anything else (cancelled, `X`, unknown) → todo. */
export function nextStatus(status: string): TaskStatus {
	switch (status) {
		case STATUS_TODO:
			return STATUS_IN_PROGRESS;
		case STATUS_IN_PROGRESS:
			return STATUS_DONE;
		default:
			return STATUS_TODO;
	}
}

export function isDone(status: string): boolean {
	return status === 'x' || status === 'X';
}

/** Todo or in progress: the task still needs work. */
export function isOpen(status: string): boolean {
	return status === STATUS_TODO || status === STATUS_IN_PROGRESS;
}

/** Map any status character to one of the four known statuses (unknown → null). */
export function normalizeStatus(status: string): TaskStatus | null {
	if (status === STATUS_TODO) return STATUS_TODO;
	if (status === STATUS_IN_PROGRESS) return STATUS_IN_PROGRESS;
	if (isDone(status)) return STATUS_DONE;
	if (status === STATUS_CANCELLED) return STATUS_CANCELLED;
	return null;
}
