import { writable } from 'svelte/store';

const defaultEnv = localStorage.getItem('env') || '';
export const envStore = writable<string>(defaultEnv);

// Store in localStorage
// TODO make this configurable
envStore.subscribe((env) => {
  localStorage.setItem('env', env);
});
