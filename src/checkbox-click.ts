import { ViewPlugin } from '@codemirror/view';
import type { EditorView, PluginValue } from '@codemirror/view';
import { MarkdownRenderChild, Notice, TFile, editorInfoField } from 'obsidian';
import type { App, MarkdownPostProcessorContext, Plugin } from 'obsidian';
import { absoluteLine, cycleTaskAtLine, documentLine } from './checkbox-cycle.ts';
import type { Disposer } from './disposer.ts';
import { STATUS_TODO, matchTask, nextStatus } from './status.ts';
import { editingViewFor } from './views.ts';

/** Whether clicking checkboxes in `file` should cycle the status. Evaluated on every click. */
export type CycleFilter = (file: TFile) => boolean;

const USER_EVENT = 'input.running-daily';
const CHECKBOX_SELECTOR = 'input.task-list-item-checkbox';

/**
 * Live Preview: a capture `click` listener on the editor DOM. Cancelling the click's default action
 * stops the native checkbox activation, so Obsidian's own `input` handler never toggles the task.
 */
class LivePreviewCheckboxHandler implements PluginValue {
	private readonly view: EditorView;
	private readonly isEnabled: CycleFilter;
	private readonly disposer: Disposer;

	constructor(view: EditorView, isEnabled: CycleFilter, disposer: Disposer) {
		this.view = view;
		this.isEnabled = isEnabled;
		this.disposer = disposer;
		view.dom.addEventListener('click', this.onClick, true);
	}

	destroy(): void {
		this.view.dom.removeEventListener('click', this.onClick, true);
	}

	private readonly onClick = (event: MouseEvent): void => {
		if (event.defaultPrevented || event.button !== 0 || this.disposer.disposed) return;
		const node = event.targetNode;
		if (!node || !node.instanceOf(HTMLInputElement) || !node.matches(CHECKBOX_SELECTOR)) return;
		// Only real task lines; checkboxes in rendered callouts, embeds or tables map to the whole widget.
		if (!node.closest('label.task-list-label') || !node.closest('.cm-line.HyperMD-task-line')) return;

		const file = this.view.state.field(editorInfoField, false)?.file;
		if (!file || !this.isEnabled(file)) return;

		let pos: number;
		try {
			pos = this.view.posAtDOM(node);
		} catch {
			return;
		}
		const line = this.view.state.doc.lineAt(pos);
		const task = matchTask(line.text);
		if (!task) return;

		event.preventDefault();
		event.stopPropagation();

		const status = nextStatus(task.status);
		const from = line.from + task.ch;
		this.view.dispatch({ changes: { from, to: from + 1, insert: status }, userEvent: USER_EVENT });
		// The cancelled activation restores the old `checked` state after this handler; fix it afterwards.
		this.disposer.timeout(
			node.win,
			() => {
				if (node.isConnected) node.checked = status !== STATUS_TODO;
			},
			0,
		);
	};
}

/** Editor extension that cycles task checkboxes in Live Preview. */
export function livePreviewCheckboxCycling(
	isEnabled: CycleFilter,
	disposer: Disposer,
): ViewPlugin<LivePreviewCheckboxHandler> {
	return ViewPlugin.define((view) => new LivePreviewCheckboxHandler(view, isEnabled, disposer));
}

/** Show `status` on a Reading view checkbox right away; the re-render after the write confirms it. */
function showStatus(input: HTMLInputElement, status: string, disposer: Disposer): void {
	disposer.timeout(
		input.win,
		() => {
			if (!input.isConnected) return;
			input.checked = status !== STATUS_TODO;
			const item = input.closest('li');
			if (item) {
				item.setAttribute('data-task', status);
				item.toggleClass('is-checked', status !== STATUS_TODO);
			}
		},
		0,
	);
}

/** Cycle the task on `line` through an editor showing `file`; null when no editing view shows it. */
function cycleInEditor(app: App, file: TFile, line: number, expected: string): boolean | null {
	const editor = editingViewFor(app, file)?.editor;
	if (!editor) return null;
	if (line >= editor.lineCount() || editor.getLine(line) !== expected) return false;
	const task = matchTask(expected);
	if (!task) return false;
	editor.replaceRange(nextStatus(task.status), { line, ch: task.ch }, { line, ch: task.ch + 1 });
	return true;
}

/**
 * Cycle the task on `line` of `file` if it still reads `expected`: through an editor showing the
 * file (so unsaved edits aren't overwritten), otherwise with `vault.process`. An editing view that
 * appears meanwhile is used instead of the disk. Returns false when the line changed or on unload.
 */
async function applyCycle(app: App, file: TFile, line: number, expected: string, disposer: Disposer): Promise<boolean> {
	const direct = cycleInEditor(app, file, line, expected);
	if (direct !== null) return direct;
	let updated = false;
	let editorAppeared = false;
	await app.vault.process(file, (data) => {
		if (disposer.disposed) return data;
		if (editingViewFor(app, file)) {
			editorAppeared = true;
			return data;
		}
		const result = cycleTaskAtLine(data, line, expected);
		if (!result) return data;
		updated = true;
		return result.content;
	});
	if (disposer.disposed) return false;
	if (editorAppeared) return cycleInEditor(app, file, line, expected) ?? false;
	return updated;
}

function handleReadingClick(
	app: App,
	isEnabled: CycleFilter,
	disposer: Disposer,
	pending: WeakSet<HTMLInputElement>,
	event: MouseEvent,
	input: HTMLInputElement,
	el: HTMLElement,
	ctx: MarkdownPostProcessorContext,
): void {
	if (event.defaultPrevented || event.button !== 0 || disposer.disposed) return;
	// Embedded notes belong to another render context; leave them to Obsidian.
	if (input.closest('.internal-embed')) return;

	const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
	if (!(file instanceof TFile) || !isEnabled(file)) return;

	// A write for this checkbox is still running: ignore the click, never let Obsidian toggle it.
	if (pending.has(input)) {
		event.preventDefault();
		event.stopPropagation();
		return;
	}

	// Resolve the line lazily: section info can be missing at post-process time.
	const info = ctx.getSectionInfo(input) ?? ctx.getSectionInfo(el);
	if (!info) return;
	const line = absoluteLine(info.lineStart, input.dataset.line);
	if (line === null) return;
	const expected = documentLine(info.text, line);
	if (expected === null) return;
	const task = matchTask(expected);
	if (!task) return;
	// Sanity check against what is rendered (e.g. data-line relative to a nested callout).
	const shown = input.closest('li')?.getAttribute('data-task');
	if (shown !== null && shown !== undefined && (shown === '' ? STATUS_TODO : shown) !== task.status) return;

	event.preventDefault();
	event.stopPropagation();

	showStatus(input, nextStatus(task.status), disposer);
	pending.add(input);
	void (async () => {
		let message = 'Could not update the task because the note has changed. Try again.';
		try {
			if (await applyCycle(app, file, line, expected, disposer)) return;
		} catch (error) {
			console.error('Running Daily: failed to update the task', error);
			message = 'Could not update the task.';
		} finally {
			pending.delete(input);
		}
		if (disposer.disposed) return;
		showStatus(input, task.status, disposer);
		new Notice(message);
	})();
}

/**
 * Reading view: capture click listeners on rendered task checkboxes. Their render children are
 * owned by the render context, and are also unloaded when `disposer` is disposed (plugin unload).
 */
export function registerReadingViewCycling(plugin: Plugin, isEnabled: CycleFilter, disposer: Disposer): void {
	const installed = new WeakSet<HTMLInputElement>();
	const pending = new WeakSet<HTMLInputElement>();
	const live = new Set<MarkdownRenderChild>();
	disposer.add(() => {
		for (const child of [...live]) child.unload();
		live.clear();
	});
	plugin.registerMarkdownPostProcessor((el, ctx) => {
		if (disposer.disposed) return;
		const inputs = el.querySelectorAll<HTMLInputElement>(`${CHECKBOX_SELECTOR}[data-line]`);
		if (inputs.length === 0) return;
		let child: MarkdownRenderChild | null = null;
		inputs.forEach((input) => {
			if (installed.has(input) || input.closest('.internal-embed')) return;
			installed.add(input);
			if (!child) {
				const created = new MarkdownRenderChild(el);
				created.register(() => live.delete(created));
				live.add(created);
				ctx.addChild(created);
				child = created;
			}
			child.registerDomEvent(
				input,
				'click',
				(event) => {
					handleReadingClick(plugin.app, isEnabled, disposer, pending, event, input, el, ctx);
				},
				{ capture: true },
			);
		});
	});
}
