import { moment, PluginSettingTab, Setting } from 'obsidian';
import type { App } from 'obsidian';
import type RunningDailyPlugin from './main.ts';

export interface RunningDailySettings {
	/** Vault path of the running daily note. */
	notePath: string;
	/** Heading of the section that holds the day headings. */
	sectionHeading: string;
	/** Moment.js format of day headings. */
	dateFormat: string;
	/** Write day headings as `[[date]]` links. */
	linkDates: boolean;
	/** Add today's heading automatically when the note is opened. */
	autoCreate: boolean;
	/** Don't add today's heading automatically on weekends. */
	skipWeekends: boolean;
	/** Move unfinished tasks from the previous day to today. */
	carryOver: boolean;
	/** Remove the previous day when nothing is left in it. */
	removeEmptyDays: boolean;
	/** Cycle checkbox status on click in every note (false: only in the running daily note). */
	cycleEverywhere: boolean;
}

export const DEFAULT_SETTINGS: RunningDailySettings = {
	notePath: 'Running daily.md',
	sectionHeading: 'Daily',
	dateFormat: 'YYYY-MM-DD',
	linkDates: true,
	autoCreate: true,
	skipWeekends: true,
	carryOver: true,
	removeEmptyDays: true,
	cycleEverywhere: true,
};

export class RunningDailySettingTab extends PluginSettingTab {
	plugin: RunningDailyPlugin;

	constructor(app: App, plugin: RunningDailyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Note path')
			.setDesc('Path of the running daily note, relative to the vault root.')
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.notePath)
					.setValue(this.plugin.settings.notePath)
					.onChange(async (value) => {
						this.plugin.settings.notePath = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Section heading')
			.setDesc('Heading of the section that contains the day headings.')
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.sectionHeading)
					.setValue(this.plugin.settings.sectionHeading)
					.onChange(async (value) => {
						this.plugin.settings.sectionHeading = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		const dateSetting = new Setting(containerEl).setName('Date format');
		const updateDateDesc = (format: string): void => {
			const sample = moment().format(format || DEFAULT_SETTINGS.dateFormat);
			dateSetting.setDesc(`Moment.js format of day headings. Today: ${sample}`);
		};
		updateDateDesc(this.plugin.settings.dateFormat);
		dateSetting.addText((text) =>
			text
				.setPlaceholder(DEFAULT_SETTINGS.dateFormat)
				.setValue(this.plugin.settings.dateFormat)
				.onChange(async (value) => {
					this.plugin.settings.dateFormat = value.trim();
					updateDateDesc(value.trim());
					await this.plugin.saveSettings();
				}),
		);

		new Setting(containerEl)
			.setName('Link dates')
			.setDesc('Write day headings as links, for example [[2026-10-16]].')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.linkDates).onChange(async (value) => {
					this.plugin.settings.linkDates = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl).setName('Day headings').setHeading();

		new Setting(containerEl)
			.setName('Add today automatically')
			.setDesc("Add today's heading when the note is opened. The open today command always adds it.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.autoCreate).onChange(async (value) => {
					this.plugin.settings.autoCreate = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Skip weekends')
			.setDesc("Don't add today's heading automatically on weekends.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.skipWeekends).onChange(async (value) => {
					this.plugin.settings.skipWeekends = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Carry over unfinished tasks')
			.setDesc('Move top-level tasks that are todo or in progress, with their subtasks, from the previous day to today.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.carryOver).onChange(async (value) => {
					this.plugin.settings.carryOver = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Remove empty days')
			.setDesc('Remove the previous day heading when nothing is left under it.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.removeEmptyDays).onChange(async (value) => {
					this.plugin.settings.removeEmptyDays = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl).setName('Checkboxes').setHeading();

		new Setting(containerEl)
			.setName('Cycle status in all notes')
			.setDesc(
				'Clicking a checkbox cycles todo, in progress and done. When off, this only happens in the running daily note.',
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.cycleEverywhere).onChange(async (value) => {
					this.plugin.settings.cycleEverywhere = value;
					await this.plugin.saveSettings();
				}),
			);
	}
}
