import type { StorageProvider, Run, Config } from '$lib/types';
import { writable } from 'svelte/store';

export const storageStore = writable<StorageProvider | null>(null);

export const configStore = writable<Config | null>(null);
export const runStore = writable<Run[]>([]);
