import type { Editor, Menu, Plugin } from 'obsidian';
import {
	STATUS_CANCELLED,
	STATUS_DONE,
	STATUS_IN_PROGRESS,
	STATUS_TODO,
	getTaskStatus,
	normalizeStatus,
} from './status.ts';
import type { TaskStatus } from './status.ts';
import { CYCLE, applyTaskStatus, getSelectedTaskLines } from './task-actions.ts';

interface StatusAction {
	status: TaskStatus;
	commandId: string;
	commandName: string;
	menuTitle: string;
	icon: string;
}

const STATUS_ACTIONS: StatusAction[] = [
	{
		status: STATUS_TODO,
		commandId: 'mark-todo',
		commandName: 'Mark task as todo',
		menuTitle: 'Mark as todo',
		icon: 'square',
	},
	{
		status: STATUS_IN_PROGRESS,
		commandId: 'mark-in-progress',
		commandName: 'Mark task as in progress',
		menuTitle: 'Mark as in progress',
		icon: 'square-dashed',
	},
	{
		status: STATUS_DONE,
		commandId: 'mark-done',
		commandName: 'Mark task as done',
		menuTitle: 'Mark as done',
		icon: 'square-check',
	},
	{
		status: STATUS_CANCELLED,
		commandId: 'mark-cancelled',
		commandName: 'Mark task as cancelled',
		menuTitle: 'Mark as cancelled',
		icon: 'square-x',
	},
];

/** Task status commands: cycle and mark as todo / in progress / done / cancelled. */
export function registerTaskCommands(plugin: Plugin): void {
	plugin.addCommand({
		id: 'cycle-task-status',
		name: 'Cycle task status',
		editorCheckCallback: (checking: boolean, editor: Editor) => {
			const lines = getSelectedTaskLines(editor);
			if (lines.length === 0) return false;
			if (!checking) applyTaskStatus(editor, lines, CYCLE);
			return true;
		},
	});

	for (const action of STATUS_ACTIONS) {
		plugin.addCommand({
			id: action.commandId,
			name: action.commandName,
			editorCheckCallback: (checking: boolean, editor: Editor) => {
				const lines = getSelectedTaskLines(editor);
				if (lines.length === 0) return false;
				if (!checking) applyTaskStatus(editor, lines, action.status);
				return true;
			},
		});
	}
}

/** Add "Mark as …" items to the editor context menu when the cursor line is a task. */
export function addTaskMenuItems(menu: Menu, editor: Editor): void {
	const cursorLine = editor.getCursor().line;
	const current = getTaskStatus(editor.getLine(cursorLine));
	if (current === null) return;
	const currentStatus = normalizeStatus(current);
	const lines = getSelectedTaskLines(editor);
	const targets = lines.length > 0 ? lines : [cursorLine];

	for (const action of STATUS_ACTIONS) {
		menu.addItem((item) =>
			item
				.setTitle(action.menuTitle)
				.setIcon(action.icon)
				.setChecked(action.status === currentStatus)
				.setSection('action')
				.onClick(() => {
					applyTaskStatus(editor, targets, action.status);
				}),
		);
	}
}
