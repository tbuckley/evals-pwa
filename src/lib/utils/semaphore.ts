export class Semaphore {
  private count: number;
  private queue: (() => void)[];

  constructor(count: number) {
    this.count = count; // Number of concurrent tasks
    this.queue = []; // Queue of tasks waiting to be executed
  }

  async acquire() {
    if (this.count > 0) {
      // If there's room for another task, run it now
      this.count--;
    } else {
      // Otherwise, wait for it to complete
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
  }

  release() {
    const nextTask = this.queue.shift();
    if (nextTask) {
      // If there are tasks waiting, run the next one now
      nextTask();
    } else {
      // Otherwise, increment the count of available tasks
      this.count++;
    }
  }
}
