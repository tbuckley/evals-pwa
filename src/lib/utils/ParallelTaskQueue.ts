import type { TaskQueue } from '$lib/types';

export class ParallelTaskQueue implements TaskQueue {
	maxParallel: number;
	queue: Array<() => Promise<void>>;
	running: number;

	completedPromise: Promise<void>;
	markCompleted?: (() => void) | null;

	constructor(maxParallel: number) {
		this.maxParallel = maxParallel;
		this.queue = [];
		this.running = 0;
		this.markCompleted = null;
		this.completedPromise = Promise.resolve();
	}
	enqueue(fn: () => Promise<void>): void {
		if (this.markCompleted === null) {
			this.completedPromise = new Promise((resolve) => {
				this.markCompleted = resolve;
			});
		}
		this.queue.push(fn);
		this.run();
	}
	run(): void {
		if (this.running >= this.maxParallel) return;
		const fn = this.queue.shift();
		if (!fn) return;
		this.running++;
		// TODO should we catch any errors?
		fn().finally(() => {
			this.running--;
			if (this.queue.length === 0 && this.running === 0) {
				// If we're the last task, signal that we're done
				this.markCompleted?.();
				this.markCompleted = null;
			} else {
				this.run();
			}
		});
	}
	completed(): Promise<void> {
		return this.completedPromise;
	}
}
