import { describe, test, expect } from 'vitest';
import { PipelineState } from './PipelineEnvironment';
import { toCodeReference } from '$lib/storage/CodeReference';
import dedent from 'dedent';

describe('PipelineState', () => {
  test('starts with the first step if no deps', {}, async function () {
    const pipeline = new PipelineState([{ id: 'step-0' }, { id: 'step-1' }, { id: 'step-2' }]);
    expect(await pipeline.getStartingSteps({})).toEqual([{ id: 'step-0' }]);
  });

  test('starts with any step with no deps', {}, async function () {
    const step0 = { id: 'step-0', deps: ['out1', 'out2'] };
    const step1 = { id: 'step-1', outputAs: 'out1', deps: [] };
    const step2 = { id: 'step-2', outputAs: 'out2', deps: [] };
    const pipeline = new PipelineState([step0, step1, step2]);
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
    const pipeline = new PipelineState([step0, step1, step2]);

    expect(await pipeline.getStartingSteps({ foo: 'bar' })).toEqual([step1]);
    expect(await pipeline.getStartingSteps({ foo: 'baz' })).toEqual([step2]);
  });

  test('goes through steps in order if no deps', {}, async function () {
    const pipeline = new PipelineState([{ id: 'step-0' }, { id: 'step-1' }, { id: 'step-2' }]);
    expect(await pipeline.getStartingSteps({})).toEqual([{ id: 'step-0' }]);
    expect(await pipeline.markCompleteAndGetNextSteps({ id: 'step-0' }, {})).toEqual({
      isLeaf: false,
      next: [{ id: 'step-1' }],
    });
    expect(await pipeline.markCompleteAndGetNextSteps({ id: 'step-1' }, {})).toEqual({
      isLeaf: false,
      next: [{ id: 'step-2' }],
    });
    expect(await pipeline.markCompleteAndGetNextSteps({ id: 'step-2' }, {})).toEqual({
      isLeaf: true,
      next: [],
    });
  });

  test('steps with multiple deps wait for them to complete', {}, async function () {
    const step0 = { id: 'step-0', deps: ['out1', 'out2'] };
    const step1 = { id: 'step-1', outputAs: 'out1', deps: [] };
    const step2 = { id: 'step-2', outputAs: 'out2', deps: [] };
    const pipeline = new PipelineState([step0, step1, step2]);

    expect(await pipeline.markCompleteAndGetNextSteps(step1, {})).toEqual({
      isLeaf: false,
      next: [],
    });
    expect(await pipeline.markCompleteAndGetNextSteps(step2, {})).toEqual({
      isLeaf: false,
      next: [step0],
    });
    expect(await pipeline.markCompleteAndGetNextSteps(step0, {})).toEqual({
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
    const pipeline = new PipelineState([step0, step1]);

    expect(await pipeline.markCompleteAndGetNextSteps(step0, { steps: 0 })).toEqual({
      isLeaf: false,
      next: [step1],
    });
    expect(await pipeline.markCompleteAndGetNextSteps(step1, { steps: 1 })).toEqual({
      isLeaf: false,
      next: [step1],
    });
    expect(await pipeline.markCompleteAndGetNextSteps(step1, { steps: 2 })).toEqual({
      isLeaf: false,
      next: [step1],
    });
    expect(await pipeline.markCompleteAndGetNextSteps(step1, { steps: 3 })).toEqual({
      isLeaf: true,
      next: [],
    });
  });
});
