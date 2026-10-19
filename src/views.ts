import { MarkdownView } from 'obsidian';
import type { App, TFile } from 'obsidian';

/** Markdown views showing `file`, the active one first. */
export function markdownViewsFor(app: App, file: TFile): MarkdownView[] {
	const views: MarkdownView[] = [];
	for (const leaf of app.workspace.getLeavesOfType('markdown')) {
		if (leaf.view instanceof MarkdownView && leaf.view.file?.path === file.path) views.push(leaf.view);
	}
	const active = app.workspace.getActiveViewOfType(MarkdownView);
	if (active && views.includes(active)) return [active, ...views.filter((view) => view !== active)];
	return views;
}

/** A view editing `file` in Live Preview or Source mode, if any. */
export function editingViewFor(app: App, file: TFile): MarkdownView | null {
	return markdownViewsFor(app, file).find((view) => view.getMode() === 'source') ?? null;
}
