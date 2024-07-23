import type { StorageProvider, Run, Config, FileLoader } from '$lib/types';
import { writable } from 'svelte/store';

export const storageStore = writable<(StorageProvider & FileLoader) | null>(null);

export const configStore = writable<Config | null>(null);
export const runStore = writable<Record<string, Run>>({});
export const selectedRunIdStore = writable<string | null>(null);
