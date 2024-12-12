import { describe, test, expect } from 'vitest';
import { makeOrderedMerge, orderedMerge, PipelineState } from './PipelineEnvironment';
import { toCodeReference } from '$lib/storage/CodeReference';
import dedent from 'dedent';

function defaultMerge<T>(a: T, _b: T) {
  return a;
}

describe('PipelineState', () => {
  test('starts with the first step if no deps', {}, async function () {
    const pipeline = new PipelineState(
      [{ id: 'step-0' }, { id: 'step-1' }, { id: 'step-2' }],
      defaultMerge,
    );
    expect(await pipeline.getStartingSteps({})).toEqual([{ id: 'step-0' }]);
  });

  test('starts with any step with no deps', {}, async function () {
    const step0 = { id: 'step-0', deps: ['out1', 'out2'] };
    const step1 = { id: 'step-1', outputAs: 'out1', deps: [] };
    const step2 = { id: 'step-2', outputAs: 'out2', deps: [] };
    const pipeline = new PipelineState([step0, step1, step2], defaultMerge);
    expect(await pipeline.getStartingSteps({})).toEqual([step1, step2]);
  });

  test('starts with any step with no deps and valid if statement', {}, async function () {
    const ifFooBar = await toCodeReference(dedent`
        function execute(vars) {
            return vars.foo === 'bar';
        }
    `);
    const ifFooBaz = await toCodeReference(dedent`
        function execute(vars) {
            return vars.foo === 'baz';
        }
    `);
    const step0 = { id: 'step-0', deps: ['out1', 'out2'] };
    const step1 = { id: 'step-1', if: ifFooBar, outputAs: 'out1', deps: [] };
    const step2 = { id: 'step-2', if: ifFooBaz, outputAs: 'out2', deps: [] };
    const pipeline = new PipelineState([step0, step1, step2], defaultMerge);

    expect(await pipeline.getStartingSteps({ foo: 'bar' })).toEqual([step1]);
    expect(await pipeline.getStartingSteps({ foo: 'baz' })).toEqual([step2]);
  });

  test('goes through steps in order if no deps', {}, async function () {
    const pipeline = new PipelineState(
      [{ id: 'step-0' }, { id: 'step-1' }, { id: 'step-2' }],
      defaultMerge,
    );
    expect(await pipeline.getStartingSteps({})).toEqual([{ id: 'step-0' }]);
    expect(await pipeline.markCompleteAndGetNextSteps({ id: 'step-0' }, {}, null)).toEqual({
      isLeaf: false,
      next: [{ step: { id: 'step-1' }, context: null }],
    });
    expect(await pipeline.markCompleteAndGetNextSteps({ id: 'step-1' }, {}, null)).toEqual({
      isLeaf: false,
      next: [{ step: { id: 'step-2' }, context: null }],
    });
    expect(await pipeline.markCompleteAndGetNextSteps({ id: 'step-2' }, {}, null)).toEqual({
      isLeaf: true,
      next: [],
    });
  });

  test('steps with multiple deps wait for them to complete', {}, async function () {
    const step0 = { id: 'step-0', deps: ['out1', 'out2'] };
    const step1 = { id: 'step-1', outputAs: 'out1', deps: [] };
    const step2 = { id: 'step-2', outputAs: 'out2', deps: [] };
    const pipeline = new PipelineState([step0, step1, step2], defaultMerge);

    expect(await pipeline.markCompleteAndGetNextSteps(step1, {}, null)).toEqual({
      isLeaf: false,
      next: [],
    });
    expect(await pipeline.markCompleteAndGetNextSteps(step2, {}, null)).toEqual({
      isLeaf: false,
      next: [{ step: step0, context: null }],
    });
    expect(await pipeline.markCompleteAndGetNextSteps(step0, {}, null)).toEqual({
      isLeaf: true,
      next: [],
    });
  });

  test('exits loops', {}, async function () {
    const code = await toCodeReference(dedent`
        function execute(vars) {
            return vars.steps < 3;
        }
    `);
    const step0 = { id: 'step-0', outputAs: 'out0' };
    const step1 = { id: 'step-1', if: code, outputAs: 'out0', deps: ['out0'] };
    const pipeline = new PipelineState([step0, step1], defaultMerge);

    expect(await pipeline.markCompleteAndGetNextSteps(step0, { steps: 0 }, null)).toEqual({
      isLeaf: false,
      next: [{ step: step1, context: null }],
    });
    expect(await pipeline.markCompleteAndGetNextSteps(step1, { steps: 1 }, null)).toEqual({
      isLeaf: false,
      next: [{ step: step1, context: null }],
    });
    expect(await pipeline.markCompleteAndGetNextSteps(step1, { steps: 2 }, null)).toEqual({
      isLeaf: false,
      next: [{ step: step1, context: null }],
    });
    expect(await pipeline.markCompleteAndGetNextSteps(step1, { steps: 3 }, null)).toEqual({
      isLeaf: true,
      next: [],
    });
  });

  test(
    'remembers only the final context for a dependency before triggering a step',
    {},
    async function () {
      const step0 = { id: 'step-0', outputAs: 'out0', deps: [] };
      const step1 = { id: 'step-1', outputAs: 'out1', deps: [] };
      const step2 = { id: 'step-2', deps: ['out0', 'out1'] };
      const pipeline = new PipelineState(
        [step0, step1, step2],
        makeOrderedMerge<number>((a, b) => a - b),
      );

      expect(await pipeline.markCompleteAndGetNextSteps(step0, {}, [1])).toEqual({
        isLeaf: false,
        next: [],
      });
      expect(await pipeline.markCompleteAndGetNextSteps(step0, {}, [2])).toEqual({
        isLeaf: false,
        next: [],
      });
      expect(await pipeline.markCompleteAndGetNextSteps(step1, {}, [3])).toEqual({
        isLeaf: false,
        next: [{ step: step2, context: [2, 3] }],
      });
    },
  );
});

describe('orderedMerge', () => {
  test('merges two sorted arrays', {}, function () {
    const a = [1, 3, 5];
    const b = [2, 4, 6];
    expect(orderedMerge(a, b, (a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('removes initial duplicates', {}, function () {
    const a = [1, 2, 3, 4];
    const b = [1, 2, 5, 6];
    expect(orderedMerge(a, b, (a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('is commutative', {}, function () {
    const a = [1, 2, 3, 5];
    const b = [1, 2, 4, 6];
    expect(orderedMerge(a, b, (a, b) => a - b)).toEqual(orderedMerge(b, a, (a, b) => a - b));
  });

  test('is idempotent', {}, function () {
    const a = [1, 2, 3, 5];
    const b = [2, 3, 4, 6];
    const mergeFn = (a: number, b: number) => a - b;
    expect(orderedMerge(a, orderedMerge(a, b, mergeFn), mergeFn)).toEqual(
      orderedMerge(a, b, mergeFn),
    );
  });
});
