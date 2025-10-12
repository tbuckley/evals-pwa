import type { VarSet } from '$lib/types';
import { Semaphore } from './semaphore';

interface LockResult {
  vars: Record<string, unknown>;
  release: (updatedVars: Record<string, unknown>) => void;
}

/**
 * Manages a shared state and locks for a set of variables.
 *
 * A client will call `await lock(["foo", "bar"])`, then later `unlock(["foo", "bar"], { foo: "baz", bar: "qux" })`.
 */
export class StateManager {
  private state: Map<string, unknown>;
  private locks: Map<string, Semaphore>;

  constructor(initialState: Record<string, unknown>) {
    this.state = new Map<string, unknown>(Object.entries(initialState));
    this.locks = new Map<string, Semaphore>();
  }

  async lock(names: string[]): Promise<LockResult> {
    // Always request locks in alphabetical order
    const sorted = [...names].sort();
    for (const name of sorted) {
      let lock = this.locks.get(name);
      if (!lock) {
        lock = new Semaphore(1);
        this.locks.set(name, lock);
      }
      await lock.acquire();
    }

    // Provide just the state vars requested
    const vars: VarSet = {};
    for (const name of sorted) {
      const value = this.state.get(name);
      vars[name] = value ?? null; // Default to null if not set
    }
    return {
      vars,
      release: (updatedVars) => {
        this.unlock(sorted, updatedVars);
      },
    };
  }

  private unlock(names: string[], updatedVars: Record<string, unknown>): void {
    for (const name of names) {
      // Update the state value, if set
      const value = updatedVars[name];
      if (value !== undefined) {
        this.state.set(name, value);
      }

      // Release the lock
      const lock = this.locks.get(name);
      if (lock) {
        lock.release();
      }
    }
  }
}
