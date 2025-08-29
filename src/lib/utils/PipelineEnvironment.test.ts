import { describe, test, expect } from 'vitest';
import {
  makeOrderedMerge,
  orderedMerge,
  PipelineState,
  type PipelineStep,
} from './PipelineEnvironment';
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
    expect(await pipeline.getStartingSteps({}, null)).toEqual([{ id: 'step-0' }]);
  });

  test('starts with any step with no deps', {}, async function () {
    const step0 = { id: 'step-0', deps: ['out1', 'out2'] };
    const step1 = { id: 'step-1', outputAs: 'out1', deps: [] };
    const step2 = { id: 'step-2', outputAs: 'out2', deps: [] };
    const pipeline = new PipelineState([step0, step1, step2], defaultMerge);
    expect(await pipeline.getStartingSteps({}, null)).toEqual([step1, step2]);
  });

  test('starts with any step where all deps are satisfied', {}, async function () {
    const step0 = { id: 'step-0', deps: [] };
    const step1 = { id: 'step-1', outputAs: 'out1', deps: ['foo'] };
    const step2 = { id: 'step-2', outputAs: 'out2', deps: ['out1', 'out2'] };
    const pipeline = new PipelineState([step0, step1, step2], defaultMerge);
    expect(await pipeline.getStartingSteps({ foo: 'bar' }, null)).toEqual([step0, step1]);
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

    expect(await pipeline.getStartingSteps({ foo: 'bar' }, null)).toEqual([step1]);
    expect(await pipeline.getStartingSteps({ foo: 'baz' }, null)).toEqual([step2]);
  });

  test('goes through steps in order if no deps', {}, async function () {
    const pipeline = new PipelineState(
      [{ id: 'first' }, { id: 'second' }, { id: 'third' }],
      defaultMerge,
    );
    expect(await pipeline.getStartingSteps({}, null)).toEqual([{ id: 'first' }]);
    expect(await pipeline.markCompleteAndGetNextSteps({ id: 'first' }, {}, null)).toEqual({
      isLeaf: false,
      next: [{ step: { id: 'second' }, context: null }],
    });
    expect(await pipeline.markCompleteAndGetNextSteps({ id: 'second' }, {}, null)).toEqual({
      isLeaf: false,
      next: [{ step: { id: 'third' }, context: null }],
    });
    expect(await pipeline.markCompleteAndGetNextSteps({ id: 'third' }, {}, null)).toEqual({
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

  test('throws an error if steps have duplicate IDs', {}, function () {
    expect(function () {
      return new PipelineState([{ id: 'step-0' }, { id: 'step-0' }], defaultMerge);
    }).toThrow('Steps have duplicate IDs');
  });

  test('allows for unregistered steps to be marked complete', {}, async function () {
    const step0 = { id: 'step-0', outputAs: 'out0', deps: [] };
    const step1 = { id: 'step-1', outputAs: 'out1', deps: ['out0'] };
    const fnFoo = { id: 'fn-foo', outputAs: 'foo', deps: ['$fn:foo'] };
    const pipeline = new PipelineState([step0, step1, fnFoo], defaultMerge);
    expect(
      await pipeline.markCompleteAndGetNextSteps(
        { id: 'fake', outputAs: '$fn:foo', deps: [] },
        {},
        null,
      ),
    ).toEqual({
      isLeaf: false,
      next: [{ step: fnFoo, context: null }],
    });
  });

  test('allow registering steps after initialization', {}, async function () {
    const step0 = { id: 'step-0', outputAs: 'out0', deps: [] };
    const step1 = { id: 'step-1', outputAs: 'out1', deps: ['out0'] };
    const fnFoo = { id: 'fn-foo', outputAs: 'foo', deps: ['$fn:foo'] };
    const pipeline = new PipelineState([step0, step1, fnFoo], defaultMerge);
    expect(
      await pipeline.markCompleteAndGetNextSteps(
        { id: 'fake', outputAs: '$fn:foo', deps: [] },
        {},
        null,
      ),
    ).toEqual({
      isLeaf: false,
      next: [{ step: fnFoo, context: null }],
    });
  });

  test('allow delayed registration of steps, triggering same dependencies', {}, async function () {
    const step0 = { id: 'step-0', outputAs: 'out0' };
    const step1 = { id: 'step-1', outputAs: 'out1', deps: ['out0'] };
    const pipeline = new PipelineState<PipelineStep, null>([step0, step1], defaultMerge);

    // Create a fake end step for step0
    const delayedStep = { id: 'step-0-end', outputAs: step0.outputAs, deps: ['virtual-step'] };
    pipeline.registerStep(delayedStep);

    expect(
      await pipeline.markCompleteAndGetNextSteps(
        { id: 'vstep', outputAs: 'virtual-step' },
        {},
        null,
      ),
    ).toEqual({
      isLeaf: false,
      next: [{ step: delayedStep, context: null }],
    });
    expect(await pipeline.markCompleteAndGetNextSteps(delayedStep, {}, null)).toEqual({
      isLeaf: false,
      next: [{ step: step1, context: null }],
    });
  });
  test('allow delayed registration of steps, triggering next ordered step', {}, async function () {
    const step0 = { id: 'step-0', outputAs: 'out0' };
    const step1 = { id: 'step-1', outputAs: 'out1' };
    const pipeline = new PipelineState<PipelineStep, null>([step0, step1], defaultMerge);

    // Create a fake end step for step0
    const delayedStep = { id: 'step-0-end', outputAs: step0.outputAs, deps: ['virtual-step'] };
    pipeline.registerStep(delayedStep, step0.id);

    expect(
      await pipeline.markCompleteAndGetNextSteps(
        { id: 'vstep', outputAs: 'virtual-step' },
        {},
        null,
      ),
    ).toEqual({
      isLeaf: false,
      next: [{ step: delayedStep, context: null }],
    });
    expect(await pipeline.markCompleteAndGetNextSteps(delayedStep, {}, null)).toEqual({
      isLeaf: false,
      next: [{ step: step1, context: null }],
    });
  });
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
