export function makeOrderedMerge<T>(cmp: (a: T, b: T) => number) {
  return (a: T[], b: T[]) => orderedMerge(a, b, cmp);
}

export function orderedMerge<T>(a: T[], b: T[], cmp: (a: T, b: T) => number): T[] {
  // merge(a, b) == merge(b, a) == merge(a, merge(a, b))
  // ABC + ABD -> ABCD
  // ABCD + ABD -> ABCD

  const merged: T[] = [];

  let ai = 0;
  let bi = 0;
  while (ai < a.length && bi < b.length) {
    const result = cmp(a[ai], b[bi]);
    if (result === 0) {
      // Identical, add just one
      merged.push(a[ai]);
      ai++;
      bi++;
    } else if (result < 0) {
      // a is less than b, add a
      merged.push(a[ai]);
      ai++;
    } else {
      // b is less than a, add b
      merged.push(b[bi]);
      bi++;
    }
  }

  // Add any remaining items
  merged.push(...a.slice(ai));
  merged.push(...b.slice(bi));

  return merged;
}
