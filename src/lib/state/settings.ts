import { writable, type Writable } from 'svelte/store';
import { z } from 'zod';

function createLocalStorageStore<T>(
  key: string,
  schema: z.ZodType<T>,
  defaultValue: T,
): Writable<T> {
  let value = defaultValue;

  // Try loading from local storage
  const storedValue = localStorage.getItem(key);
  if (storedValue) {
    const parsed = schema.safeParse(JSON.parse(storedValue));
    if (parsed.success) {
      value = parsed.data;
    }
  }

  const store = writable<T>(value);

  store.subscribe((value) => {
    localStorage.setItem(key, JSON.stringify(value));
  });
  return store;
}

const boolSchema = z.boolean();

export const showVarsColumnsStore = createLocalStorageStore<boolean>(
  'showVarsColumns',
  boolSchema,
  true,
);

const rowHeightSchema = z.union([
  z.literal('minimal'),
  z.literal('collapsed'),
  z.literal('expanded'),
]);
export type RowHeight = z.infer<typeof rowHeightSchema>;

export const rowHeightStore = createLocalStorageStore<RowHeight>(
  'rowHeight',
  rowHeightSchema,
  'expanded',
);
