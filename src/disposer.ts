/**
 * Cancels everything a plugin instance started (SPEC §5c). Pure: timers come from a `TimerHost`
 * (the node's `win`, or `window`), so it is unit tested.
 */

export interface TimerHost {
	setTimeout(handler: () => void, ms: number): number;
	clearTimeout(id: number): void;
}

export class Disposer {
	private cleanups = new Set<() => void>();
	private isDisposed = false;

	get disposed(): boolean {
		return this.isDisposed;
	}

	/** Run `cleanup` on dispose (right away if already disposed). Returns a function that unregisters it. */
	add(cleanup: () => void): () => void {
		if (this.isDisposed) {
			cleanup();
			return () => {};
		}
		this.cleanups.add(cleanup);
		return () => {
			this.cleanups.delete(cleanup);
		};
	}

	dispose(): void {
		if (this.isDisposed) return;
		this.isDisposed = true;
		const cleanups = [...this.cleanups];
		this.cleanups.clear();
		for (const cleanup of cleanups) cleanup();
	}

	/** `setTimeout` that is cleared on dispose. */
	timeout(host: TimerHost, fn: () => void, ms: number): void {
		if (this.isDisposed) return;
		let id = 0;
		const remove = this.add(() => host.clearTimeout(id));
		id = host.setTimeout(() => {
			remove();
			fn();
		}, ms);
	}

	/** Resolves after `ms`, or immediately on dispose. Check `disposed` after awaiting. */
	sleep(host: TimerHost, ms: number): Promise<void> {
		return new Promise((resolve) => {
			if (this.isDisposed) {
				resolve();
				return;
			}
			let id = 0;
			const remove = this.add(() => {
				host.clearTimeout(id);
				resolve();
			});
			id = host.setTimeout(() => {
				remove();
				resolve();
			}, ms);
		});
	}
}
