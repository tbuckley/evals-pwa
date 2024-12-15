import { cast } from './asserts';

export function generator<T, S>(): {
  generator: AsyncGenerator<T & {}, S>;
  yield: (value: T) => void;
  return: (value: S) => void;
} {
  const queue: T[] = [];
  let finished: { value: S } | null = null;
  let update: (() => void) | null = null;
  let ready: Promise<void>;
  return {
    generator: (async function* () {
      for (;;) {
        ready = new Promise<void>((resolve) => void (update = resolve));
        await ready;
        while (queue.length) {
          yield cast(queue.shift());
        }
        if (finished as { value: S } | null) {
          return (finished as unknown as { value: S }).value;
        }
      }
    })(),
    yield(value) {
      queue.push(value);
      if (update) {
        update();
      }
    },
    return(value) {
      finished = { value };
      if (update) {
        update();
      }
    },
  };
}
