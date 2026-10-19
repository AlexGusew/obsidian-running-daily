/**
 * Pure helpers for checkbox click cycling. No Obsidian imports.
 */

import { matchTask, nextStatus } from './status.ts';

/**
 * Absolute 0-based line of a Reading view checkbox: `data-line` is relative to its section.
 * Returns null when the attribute is missing or not a non-negative integer.
 */
export function absoluteLine(lineStart: number, dataLine: string | undefined): number | null {
	if (dataLine === undefined || !/^\d+$/.test(dataLine)) return null;
	return lineStart + Number(dataLine);
}

/** Text of 0-based line `line` of the whole document `text` (section info text), without `\r`; null when missing. */
export function documentLine(text: string, line: number): string | null {
	const value = text.split('\n')[line];
	return value === undefined ? null : value.replace(/\r$/, '');
}

export interface CycleResult {
	content: string;
	status: string;
}

/**
 * Cycle the task on 0-based line `line` of `content`. When `expected` is given, the current line
 * (without `\r`) must equal it, otherwise nothing changes (stale view). Line endings are preserved.
 * Returns null when the line is missing, not a task, or doesn't match `expected`.
 */
export function cycleTaskAtLine(content: string, line: number, expected?: string | null): CycleResult | null {
	const lines = content.split('\n');
	const raw = lines[line];
	if (raw === undefined) return null;
	const cr = raw.endsWith('\r');
	const text = cr ? raw.slice(0, -1) : raw;
	if (expected !== undefined && expected !== null && text !== expected) return null;
	const m = matchTask(text);
	if (!m) return null;
	const status = nextStatus(m.status);
	lines[line] = text.slice(0, m.ch) + status + text.slice(m.ch + 1) + (cr ? '\r' : '');
	return { content: lines.join('\n'), status };
}
