import { writable } from 'svelte/store';

export interface AlertState {
	id?: string;
	title: string;
	description: string[];
	cancelText?: string | null;
	confirmText?: string;
	callback: (result: boolean) => void;
}

export const alertStore = writable<AlertState | null>(null);
