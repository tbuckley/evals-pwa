import type { TaskQueue } from '$lib/types';

export type TaskFn = (opts: { abortSignal: AbortSignal }) => Promise<void>;

export class ParallelTaskQueue implements TaskQueue {
  private maxParallel: number;
  private queue: TaskFn[];
  private running: number;

  private completedPromise: Promise<void>;
  private markCompleted?: (() => void) | null;
  private rejectCompleted?: (reason: unknown) => void;
  private abortController: AbortController;

  constructor(maxParallel: number) {
    this.maxParallel = maxParallel;
    this.queue = [];
    this.running = 0;
    this.markCompleted = null;
    this.completedPromise = Promise.resolve();
    this.abortController = new AbortController();
  }
  abort(): void {
    this.abortController.abort();
    this.rejectCompleted?.(new Error('TaskQueue was aborted'));
  }
  enqueue(fn: TaskFn): void {
    if (this.abortController.signal.aborted) {
      throw new Error('TaskQueue was aborted');
    }

    if (this.markCompleted === null) {
      this.completedPromise = new Promise((resolve, reject) => {
        this.markCompleted = resolve;
        this.rejectCompleted = reject;
      });
    }
    this.queue.push(fn);
    this.run();
  }
  private run(): void {
    if (this.running >= this.maxParallel) return;
    const fn = this.queue.shift();
    if (!fn) return;
    this.running++;
    // TODO should we catch any errors?
    // TODO pass abort signal to functions?
    fn({ abortSignal: this.abortController.signal })
      .catch((err: unknown) => {
        throw new Error('ParallelTaskQueue task failed', { cause: err });
      })
      .finally(() => {
        if (this.abortController.signal.aborted) {
          // If already aborted, ignore any results
          return;
        }
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
  remaining(): number {
    return this.queue.length + this.running;
  }
}
