import type { LiveResult } from '$lib/types';
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

export interface ResultDialogState {
  title: string;
  result: LiveResult | null;
}

export const resultDialogStore = writable<ResultDialogState>({
  title: '',
  result: null,
});

export interface ResultNotesDialogState {
  index: [number, number];
  notes: string;
  onSave: (notes: string) => Promise<void>;
  callback?: () => void;
}

export const resultNotesDialogStore = writable<ResultNotesDialogState | null>(null);
