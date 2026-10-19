/**
 * Running daily note logic. Pure functions, no Obsidian imports.
 */

import { getTaskStatus, isOpen } from './status.ts';

export interface DailyOptions {
	sectionHeading: string;
	linkDates: boolean;
	carryOver: boolean;
	removeEmptyDays: boolean;
}

/** Why `ensureDay` refused to touch the note. */
export type EnsureDayBlocked = 'unbalanced' | 'section-level';

/** Line indexes are 0-based and refer to `content` (-1 when blocked). */
export interface EnsureDayResult {
	content: string;
	changed: boolean;
	dayLine: number;
	dayEndLine: number;
	blocked?: EnsureDayBlocked;
}

interface Heading {
	line: number;
	level: number;
	text: string;
}

interface Scan {
	/** False when front matter or a code fence is never closed. */
	balanced: boolean;
	/** Per line: index of the line that opened the enclosing front matter or fence (delimiters included), else -1. */
	codeStart: number[];
	/** Column-0 ATX headings outside front matter and fences. */
	headings: Heading[];
}

const HEADING_RE = /^(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
const FENCE_RE = /^[ \t]*(`{3,}|~{3,})/;

function isBlank(line: string): boolean {
	return line.trim() === '';
}

/** Normalize a section heading for comparison: trim, drop trailing `:`, ignore case. */
function normalizeSectionName(text: string): string {
	return text.trim().replace(/[\s:]+$/, '').toLowerCase();
}

/** Day label: one wrapping `[[target|alias]]` reduced to `target`, trailing `:` and whitespace removed. */
export function dayLabel(headingText: string): string {
	let text = headingText.trim().replace(/[\s:]+$/, '');
	const link = /^\[\[([^\]|]*)(?:\|[^\]]*)?\]\]$/.exec(text);
	if (link) text = (link[1] ?? '').trim();
	return text.replace(/[\s:]+$/, '');
}

/** Find front matter, fenced code (``` and ~~~) and headings. */
function scan(lines: string[]): Scan {
	const codeStart = lines.map(() => -1);
	const headings: Heading[] = [];
	let i = 0;
	if (lines[0] === '---') {
		let end = -1;
		for (let j = 1; j < lines.length; j++) {
			if (lines[j] === '---' || lines[j] === '...') {
				end = j;
				break;
			}
		}
		if (end < 0) return { balanced: false, codeStart, headings };
		for (let j = 0; j <= end; j++) codeStart[j] = 0;
		i = end + 1;
	}
	let fence = '';
	let fenceLine = -1;
	for (; i < lines.length; i++) {
		const line = lines[i] ?? '';
		const f = FENCE_RE.exec(line)?.[1];
		if (fenceLine >= 0) {
			codeStart[i] = fenceLine;
			if (f && f[0] === fence[0] && f.length >= fence.length && line.trim() === f) fenceLine = -1;
			continue;
		}
		if (f) {
			fence = f;
			fenceLine = i;
			codeStart[i] = i;
			continue;
		}
		const m = HEADING_RE.exec(line);
		if (!m) continue;
		const text = (m[2] ?? '').replace(/(?:^|[ \t]+)#+$/, '').trim();
		headings.push({ line: i, level: (m[1] ?? '').length, text });
	}
	return { balanced: fenceLine < 0, codeStart, headings };
}

/** Index of the first heading after `from` with level <= `level`, or `fallback`. */
function blockEnd(headings: Heading[], from: number, level: number, fallback: number): number {
	for (const h of headings) {
		if (h.line > from && h.level <= level) return Math.min(h.line, fallback);
	}
	return fallback;
}

function lastNonBlank(lines: string[], start: number, end: number): number {
	for (let i = end - 1; i > start; i--) {
		if (!isBlank(lines[i] ?? '')) return i;
	}
	return start;
}

function refuse(content: string, blocked: EnsureDayBlocked): EnsureDayResult {
	return { content, changed: false, dayLine: -1, dayEndLine: -1, blocked };
}

/**
 * Lines of the previous day's block that move to today: top-level todo / in-progress tasks with their
 * subtree (following non-blank indented lines, plus the whole of any fence whose opening line is one of
 * those indented lines). A column-0 fence ends the subtree. Lines inside code are never treated as tasks.
 */
function carriedLines(lines: string[], codeStart: number[], from: number, to: number): Set<number> {
	const moved = new Set<number>();
	let i = from;
	while (i < to) {
		const line = lines[i] ?? '';
		const status = codeStart[i] === -1 && /^[^ \t]/.test(line) ? getTaskStatus(line) : null;
		if (status === null || !isOpen(status)) {
			i++;
			continue;
		}
		const top = i;
		moved.add(i++);
		while (i < to) {
			const child = lines[i] ?? '';
			const open = codeStart[i] ?? -1;
			const inOwnFence = open > top && open < i && moved.has(open);
			if (!inOwnFence && (isBlank(child) || !/^[ \t]/.test(child))) break;
			moved.add(i++);
		}
	}
	return moved;
}

/**
 * Make sure the running daily note has a heading for `dateLabel` inside the daily section.
 * See SPEC §3.5 and §5b for the exact rules.
 */
export function ensureDay(content: string, dateLabel: string, opts: DailyOptions): EnsureDayResult {
	const eol = content.includes('\r\n') ? '\r\n' : '\n';
	const lines = content === '' ? [] : content.split(/\r?\n/);
	const finalNewline = lines.length > 0 && lines[lines.length - 1] === '';
	if (finalNewline) lines.pop();

	const parsed = scan(lines);
	if (!parsed.balanced) return refuse(content, 'unbalanced');
	const { codeStart } = parsed;
	let { headings } = parsed;
	const target = dateLabel.trim();
	const sectionName = normalizeSectionName(opts.sectionHeading);

	// Locate (or create at EOF) the section.
	let section = headings.find((h) => normalizeSectionName(h.text) === sectionName);
	if (section && section.level >= 6) return refuse(content, 'section-level');
	if (!section) {
		while (lines.length > 0 && isBlank(lines[lines.length - 1] ?? '')) lines.pop();
		if (lines.length > 0) lines.push('');
		lines.push(`## ${opts.sectionHeading.trim()}`);
		section = { line: lines.length - 1, level: 2, text: opts.sectionHeading.trim() };
		headings = [...headings, section];
	}
	const sectionLine = section.line;
	const dayLevel = section.level + 1;
	let sectionEnd = blockEnd(headings, sectionLine, section.level, lines.length);
	const days = headings.filter((h) => h.line > sectionLine && h.line < sectionEnd && h.level === dayLevel);

	// Today already exists (the first match wins).
	const today = days.find((h) => dayLabel(h.text) === target);
	if (today) {
		const end = blockEnd(headings, today.line, dayLevel, sectionEnd);
		return { content, changed: false, dayLine: today.line, dayEndLine: lastNonBlank(lines, today.line, end) };
	}

	// Carry over unfinished top-level tasks from the previous (last) day.
	const moved: string[] = [];
	const prev = days[days.length - 1];
	if (prev) {
		const prevEnd = blockEnd(headings, prev.line, dayLevel, sectionEnd);
		const carried = opts.carryOver ? carriedLines(lines, codeStart, prev.line + 1, prevEnd) : new Set<number>();
		const kept: string[] = [];
		for (let i = prev.line + 1; i < prevEnd; i++) {
			if (carried.has(i)) moved.push(lines[i] ?? '');
			else kept.push(lines[i] ?? '');
		}
		if (opts.removeEmptyDays && kept.every(isBlank)) {
			lines.splice(prev.line, prevEnd - prev.line);
			sectionEnd -= prevEnd - prev.line;
		} else if (moved.length > 0) {
			lines.splice(prev.line + 1, prevEnd - prev.line - 1, ...kept);
			sectionEnd -= moved.length;
		}
	}

	// Append today's heading at the end of the section, normalising blank lines only inside it.
	let insertAt = sectionEnd;
	while (insertAt > sectionLine + 1 && isBlank(lines[insertAt - 1] ?? '')) insertAt--;
	const atEof = sectionEnd >= lines.length;
	const heading = `${'#'.repeat(dayLevel)} ${opts.linkDates ? `[[${target}]]` : target}`;
	const block = ['', heading, ...moved];
	if (!atEof) block.push('');
	lines.splice(insertAt, sectionEnd - insertAt, ...block);

	const dayLine = insertAt + 1;
	return {
		content: lines.join(eol) + (atEof || finalNewline ? eol : ''),
		changed: true,
		dayLine,
		dayEndLine: dayLine + moved.length,
	};
}

export interface LinePosition {
	line: number;
	ch: number;
}

export interface LineDiff {
	/** Start of the replaced range in the old text (always `ch: 0`). */
	from: LinePosition;
	/** End of the replaced range in the old text (exclusive). */
	to: LinePosition;
	/** Replacement text. */
	text: string;
}

/**
 * Minimal whole-line change turning `oldText` into `newText`: common leading and trailing lines
 * are kept, the rest is one replacement. Lines are split on `\n` or `\r\n`, so positions are
 * editor-style (`ch` never counts `\r`) and can be passed to `Editor.replaceRange(text, from, to)`.
 * Returns null when the texts are equal.
 */
export function diffLines(oldText: string, newText: string): LineDiff | null {
	if (oldText === newText) return null;
	const eol = newText.includes('\r\n') ? '\r\n' : '\n';
	const a = oldText.split(/\r?\n/);
	const b = newText.split(/\r?\n/);
	const min = Math.min(a.length, b.length);

	// Keep line `prefix` out of the common prefix so that it exists in both texts.
	let prefix = 0;
	while (prefix < min - 1 && a[prefix] === b[prefix]) prefix++;
	let suffix = 0;
	while (suffix < min - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;

	const inserted = b.slice(prefix, b.length - suffix);
	const from = { line: prefix, ch: 0 };
	if (suffix > 0) {
		return { from, to: { line: a.length - suffix, ch: 0 }, text: inserted.map((l) => l + eol).join('') };
	}
	const last = a.length - 1;
	return { from, to: { line: last, ch: (a[last] ?? '').length }, text: inserted.join(eol) };
}

/**
 * Position of the `dateLabel` day block in `content` as it is now, or null when the note has no
 * such heading (or would be refused). Used to reveal today in whatever text a view shows.
 */
export function findDay(
	content: string,
	dateLabel: string,
	opts: DailyOptions,
): { dayLine: number; dayEndLine: number } | null {
	const r = ensureDay(content, dateLabel, opts);
	return r.changed || r.blocked || r.dayLine < 0 ? null : { dayLine: r.dayLine, dayEndLine: r.dayEndLine };
}
