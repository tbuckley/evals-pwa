import { writable, type Writable } from 'svelte/store';

function createLocalStorageStore<T>(key: string, defaultValue: T): Writable<T> {
	const storedValue = localStorage.getItem(key);
	const store = writable<T>(storedValue ? JSON.parse(storedValue) : defaultValue);

	store.subscribe((value) => {
		localStorage.setItem(key, JSON.stringify(value));
	});
	return store;
}

export const showVarsColumnsStore = createLocalStorageStore<boolean>('showVarsColumns', true);
