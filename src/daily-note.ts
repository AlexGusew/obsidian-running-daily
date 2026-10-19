import { MarkdownView, Notice, TFile, moment, normalizePath } from 'obsidian';
import type { App, WorkspaceLeaf } from 'obsidian';
import { ensureDay, findDay } from './daily.ts';
import type { DailyOptions, EnsureDayBlocked, EnsureDayResult } from './daily.ts';
import type { Disposer } from './disposer.ts';
import { SingleFlight, ensureNote } from './ensure-note.ts';
import type { NoteAccess } from './ensure-note.ts';
import { DEFAULT_SETTINGS } from './settings.ts';
import type { RunningDailySettings } from './settings.ts';
import { editingViewFor, markdownViewsFor } from './views.ts';

/** Calendar day, independent of the heading format. */
function dayKey(): string {
	return moment().format('YYYY-MM-DD');
}

const BLOCKED_MESSAGES: Record<EnsureDayBlocked, string> = {
	unbalanced:
		"Today's heading was not added: the running daily note has an unclosed code block or front matter.",
	'section-level': "Today's heading was not added: the daily section can't be a level 6 heading.",
};

/** Delay before scrolling a Reading view again, once it has re-rendered after a disk write. */
const RESCROLL_MS = 250;

/** Outcome of one ensure run: written/checked, deferred (editor kept differing from disk), failed, or cancelled by unload. */
type EnsureRun = EnsureDayResult | 'deferred' | 'failed' | 'cancelled';

/** Opens the running daily note and keeps today's heading in it. Nothing happens after `disposer` is disposed. */
export class DailyNoteController {
	private app: App;
	private getSettings: () => RunningDailySettings;
	private disposer: Disposer;
	private inflight = new SingleFlight<EnsureRun>();
	/** Note and day of the last unblocked, completed ensure; the minute tick retries until it matches. */
	private ensured: { path: string; day: string } | null = null;
	/** `path|day|reason` of blocked notices already shown today (SPEC §5d). */
	private blockedNotices = new Set<string>();
	private blockedNoticesDay = '';
	/** Last file path shown in each leaf: switching back to a tab already showing the note isn't navigation. */
	private leafPaths = new WeakMap<WorkspaceLeaf, string>();

	constructor(app: App, getSettings: () => RunningDailySettings, disposer: Disposer) {
		this.app = app;
		this.getSettings = getSettings;
		this.disposer = disposer;
	}

	notePath(): string {
		const raw = this.getSettings().notePath.trim() || DEFAULT_SETTINGS.notePath;
		let path = normalizePath(raw);
		if (!/\.md$/i.test(path)) path += '.md';
		return path;
	}

	isDailyNote(file: TFile | null): file is TFile {
		return file instanceof TFile && file.path === this.notePath();
	}

	private todayLabel(): string {
		return moment().format(this.getSettings().dateFormat.trim() || DEFAULT_SETTINGS.dateFormat);
	}

	private dailyOptions(): DailyOptions {
		const s = this.getSettings();
		return {
			sectionHeading: s.sectionHeading.trim() || DEFAULT_SETTINGS.sectionHeading,
			linkDates: s.linkDates,
			carryOver: s.carryOver,
			removeEmptyDays: s.removeEmptyDays,
		};
	}

	/** Whether today's heading should be added automatically. */
	private shouldAutoCreate(): boolean {
		const s = this.getSettings();
		if (!s.autoCreate) return false;
		const weekday = moment().day();
		return !(s.skipWeekends && (weekday === 0 || weekday === 6));
	}

	private notice(message: string): void {
		if (!this.disposer.disposed) new Notice(message);
	}

	/** Show a blocked notice at most once per note, day and reason; the command resets it first. */
	private notifyBlocked(path: string, day: string, reason: EnsureDayBlocked): void {
		if (day !== this.blockedNoticesDay) {
			this.blockedNotices.clear();
			this.blockedNoticesDay = day;
		}
		const key = `${path}|${day}|${reason}`;
		if (this.blockedNotices.has(key)) return;
		this.blockedNotices.add(key);
		this.notice(BLOCKED_MESSAGES[reason]);
	}

	private forgetBlockedNotices(path: string): void {
		const prefix = `${path}|${dayKey()}|`;
		for (const key of [...this.blockedNotices]) if (key.startsWith(prefix)) this.blockedNotices.delete(key);
	}

	/** Called on `file-open`. */
	handleFileOpen(file: TFile | null): void {
		const leaf = this.app.workspace.getActiveViewOfType(MarkdownView)?.leaf;
		const previous = leaf ? this.leafPaths.get(leaf) : undefined;
		if (leaf && file) this.leafPaths.set(leaf, file.path);
		if (!this.isDailyNote(file) || !this.shouldAutoCreate()) return;
		const navigated = previous !== file.path;
		void this.ensureToday(file).then((run) => {
			if (typeof run !== 'object' || run.blocked || this.disposer.disposed) return;
			if (navigated || run.changed) this.reveal(file, run.changed, false);
		});
	}

	/** Called once the workspace layout is ready. */
	handleLayoutReady(): void {
		const file = this.app.workspace.getActiveFile();
		if (this.isDailyNote(file)) this.handleFileOpen(file);
	}

	/** Called every minute: add today's heading after midnight while the note is open; retries until it succeeds. */
	handleTick(): void {
		const path = this.notePath();
		const day = dayKey();
		if ((this.ensured?.path === path && this.ensured.day === day) || !this.shouldAutoCreate()) return;
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile) || markdownViewsFor(this.app, file).length === 0) return;
		void this.ensureToday(file);
	}

	/** "Open today": open (or create) the note, always ensure today's heading, then reveal it. */
	async openToday(): Promise<void> {
		const path = this.notePath();
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing && !(existing instanceof TFile)) {
			this.notice(`Cannot open the running daily note: "${path}" is a folder.`);
			return;
		}
		let file: TFile;
		try {
			if (existing instanceof TFile) {
				file = existing;
			} else {
				await this.ensureParentFolder(path);
				if (this.disposer.disposed) return;
				file = await this.app.vault.create(path, ensureDay('', this.todayLabel(), this.dailyOptions()).content);
				if (this.disposer.disposed) return;
			}
			const view = markdownViewsFor(this.app, file)[0];
			if (view) this.app.workspace.setActiveLeaf(view.leaf, { focus: true });
			else await this.app.workspace.getLeaf(false).openFile(file, { active: true });
		} catch (error) {
			if (this.disposer.disposed) return;
			this.notice('Cannot open the running daily note.');
			console.error('Running Daily: failed to open the note', error);
			return;
		}
		if (this.disposer.disposed) return;
		// An explicit command always reports why today's heading could not be added.
		this.forgetBlockedNotices(file.path);
		const run = await this.ensureToday(file);
		if (this.disposer.disposed) return;
		if (typeof run === 'object') {
			// The shared run may have notified before the key was cleared; the key dedupes the rest.
			if (run.blocked) this.notifyBlocked(file.path, dayKey(), run.blocked);
			else this.reveal(file, run.changed, true);
		} else if (run === 'deferred') {
			this.notice('The running daily note has unsaved changes. Try again in a moment.');
		}
	}

	private async ensureParentFolder(path: string): Promise<void> {
		const slash = path.lastIndexOf('/');
		if (slash <= 0) return;
		const folder = path.slice(0, slash);
		if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
	}

	/** Make sure today's heading exists. Overlapping calls for the same note share one run. */
	ensureToday(file: TFile): Promise<EnsureRun> {
		return this.inflight.run(file.path, () => this.runEnsure(file));
	}

	private async runEnsure(file: TFile): Promise<EnsureRun> {
		const day = dayKey();
		const label = this.todayLabel();
		const options = this.dailyOptions();
		try {
			const result = await ensureNote(this.access(file), (text) => ensureDay(text, label, options));
			if (this.disposer.disposed) return 'cancelled';
			if (result?.blocked) this.notifyBlocked(file.path, day, result.blocked);
			else if (result) this.ensured = { path: file.path, day };
			return result ?? 'deferred';
		} catch (error) {
			if (this.disposer.disposed) return 'cancelled';
			this.notice("Cannot add today's heading to the running daily note.");
			console.error('Running Daily: failed to update the note', error);
			return 'failed';
		}
	}

	private access(file: TFile): NoteAccess {
		return {
			editor: () => editingViewFor(this.app, file)?.editor ?? null,
			readDisk: () => this.app.vault.read(file),
			processDisk: async (fn) => {
				await this.app.vault.process(file, fn);
			},
			sleep: (ms) => this.disposer.sleep(window, ms),
			cancelled: () => this.disposer.disposed,
		};
	}

	/**
	 * Editing mode: cursor at the end of today's block, scrolled into view. Reading mode: scroll to
	 * today. Today's position is looked up in the text the view currently shows.
	 */
	private reveal(file: TFile, changed: boolean, focus: boolean): void {
		if (this.disposer.disposed) return;
		const view = markdownViewsFor(this.app, file)[0];
		if (!view) return;
		const mode = view.getMode();
		const label = this.todayLabel();
		const options = this.dailyOptions();
		const stillShown = (): boolean =>
			!this.disposer.disposed &&
			view.file?.path === file.path &&
			view.getMode() === mode &&
			markdownViewsFor(this.app, file).includes(view);

		if (mode === 'preview') {
			const scroll = (): void => {
				if (!stillShown()) return;
				const day = findDay(view.getViewData(), label, options);
				if (day) view.previewMode.applyScroll(day.dayLine);
			};
			scroll();
			// The preview re-renders after a disk write; scroll again once it has.
			if (changed) this.disposer.timeout(window, scroll, RESCROLL_MS);
			return;
		}
		const editor = view.editor;
		const day = findDay(editor.getValue(), label, options);
		if (!day || day.dayEndLine >= editor.lineCount()) return;
		const end = { line: day.dayEndLine, ch: editor.getLine(day.dayEndLine).length };
		editor.setCursor(end);
		editor.scrollIntoView({ from: { line: day.dayLine, ch: 0 }, to: end }, true);
		if (focus) editor.focus();
	}
}
