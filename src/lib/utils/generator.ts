import { cast } from './asserts';

export function generator<T>(): {
  generator: AsyncGenerator<T>;
  yield: (value: T) => void;
  return: () => void;
} {
  const queue: T[] = [];
  let finished = false;
  let update: () => void;
  let ready: Promise<void>;
  return {
    generator: (async function* () {
      for (;;) {
        ready = new Promise<void>((resolve) => void (update = resolve));
        await ready;
        while (queue.length) {
          yield cast(queue.shift());
        }
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (finished) {
          return;
        }
      }
    })(),
    yield(value) {
      queue.push(value);
      update();
    },
    return() {
      finished = true;
      update();
    },
  };
}
