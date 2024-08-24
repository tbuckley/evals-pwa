import type { StorageProvider, Run, FileLoader, NormalizedConfig, LiveRun } from '$lib/types';
import { writable } from 'svelte/store';

export const storageStore = writable<(StorageProvider & FileLoader) | null>(null);

export const configStore = writable<NormalizedConfig | null>(null);
export const runStore = writable<Record<string, Run>>({});
export const liveRunStore = writable<Record<string, { run: LiveRun; abort: () => void }>>({});
export const selectedRunIdStore = writable<string | null>(null);
