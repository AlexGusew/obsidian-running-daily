import { Plugin } from 'obsidian';
import type { TFile } from 'obsidian';
import { livePreviewCheckboxCycling, registerReadingViewCycling } from './checkbox-click.ts';
import { addTaskMenuItems, registerTaskCommands } from './commands.ts';
import { DailyNoteController } from './daily-note.ts';
import { Disposer } from './disposer.ts';
import { DEFAULT_SETTINGS, RunningDailySettingTab } from './settings.ts';
import type { RunningDailySettings } from './settings.ts';

const DAY_CHECK_INTERVAL_MS = 60 * 1000;

export default class RunningDailyPlugin extends Plugin {
	settings: RunningDailySettings = { ...DEFAULT_SETTINGS };
	private daily!: DailyNoteController;

	async onload(): Promise<void> {
		// Cancels pending retries, timers and Reading view listeners on unload (SPEC §5c). Registered
		// before the first await, so an unload while settings load also stops everything below.
		const disposer = new Disposer();
		this.register(() => disposer.dispose());
		await this.loadSettings();
		if (disposer.disposed) return;
		this.daily = new DailyNoteController(this.app, () => this.settings, disposer);

		this.addSettingTab(new RunningDailySettingTab(this.app, this));

		this.addCommand({
			id: 'open-today',
			name: 'Open today',
			callback: () => {
				void this.daily.openToday();
			},
		});
		registerTaskCommands(this);

		this.addRibbonIcon('calendar-check', 'Open today in running daily', () => {
			void this.daily.openToday();
		});

		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu, editor) => {
				addTaskMenuItems(menu, editor);
			}),
		);

		this.registerEvent(
			this.app.workspace.on('file-open', (file) => {
				this.daily.handleFileOpen(file);
			}),
		);
		this.app.workspace.onLayoutReady(() => {
			this.daily.handleLayoutReady();
		});
		this.registerInterval(
			window.setInterval(() => {
				this.daily.handleTick();
			}, DAY_CHECK_INTERVAL_MS),
		);

		// Clicking a task checkbox cycles its status (Live Preview and Reading view).
		const cycleEnabled = (file: TFile): boolean =>
			this.settings.cycleEverywhere || this.daily.isDailyNote(file);
		this.registerEditorExtension(livePreviewCheckboxCycling(cycleEnabled, disposer));
		registerReadingViewCycling(this, cycleEnabled, disposer);
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<RunningDailySettings> | null,
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
