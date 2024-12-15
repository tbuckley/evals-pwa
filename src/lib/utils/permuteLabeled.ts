export type Label = string | symbol;

export class LabelNotFoundError extends Error {
  constructor(public label: Label) {
    super(`No instances found for label: ${label.toString()}`);
  }
}

export function permuteLabeled<T>(
  labels: Set<Label>,
  instances: T[],
  hasLabel: (instance: T, label: Label) => boolean,
): Record<Label, T>[] {
  // Group instances by label
  const labelsArray = Array.from(labels);
  const instancesForLabel: T[][] = [];
  for (const label of labelsArray) {
    const labelInstances = instances.filter((instance) => hasLabel(instance, label));
    if (labelInstances.length === 0) {
      throw new LabelNotFoundError(label);
    }
    instancesForLabel.push(labelInstances);
  }

  // Create an array of every permutation of the instances
  const permutations: Record<Label, T>[] = [];
  for (const permutation of permute(...instancesForLabel)) {
    const labeledPermutation: Record<Label, T> = {};
    permutation.forEach((instance, index) => (labeledPermutation[labelsArray[index]] = instance));
    permutations.push(labeledPermutation);
  }

  return permutations;
}

function* permute<T>(...args: T[][]): Generator<T[]> {
  if (args.length === 0) {
    yield [];
    return;
  }

  const [first, ...rest] = args;
  for (const val of first) {
    for (const perm of permute(...rest)) {
      yield [val, ...perm];
    }
  }
}
