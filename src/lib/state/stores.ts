import type { StorageProvider, Prompt, Run, TestCase } from '$lib/types';
import { writable } from 'svelte/store';

export const storageStore = writable<StorageProvider | null>(null);

export const promptStore = writable<Prompt[]>([]);
export const testStore = writable<TestCase[]>([]);
export const runStore = writable<Run[]>([]);
