import { describe, test, expect } from 'vitest';
import {
  makeOrderedMerge,
  orderedMerge,
  PipelineState,
  PipelineEnvironment,
} from './PipelineEnvironment';
import { toCodeReference } from '$lib/storage/CodeReference';
import dedent from 'dedent';
import type {
  ModelProvider,
  RunContext,
  TokenUsage,
  NormalizedPipelinePrompt,
  TestOutput,
} from '$lib/types';

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
      [{ id: 'step-0' }, { id: 'step-1' }, { id: 'step-2' }],
      defaultMerge,
    );
    expect(await pipeline.getStartingSteps({}, null)).toEqual([{ id: 'step-0' }]);
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

  test('throws an error if steps have duplicate IDs', {}, function () {
    expect(function () {
      return new PipelineState([{ id: 'step-0' }, { id: 'step-0' }], defaultMerge);
    }).toThrow('Steps have duplicate IDs');
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

describe('PipelineEnvironment Transform', () => {
  // Mock model provider for testing
  const mockProvider: ModelProvider = {
    id: 'test-provider',
    run() {
      return Promise.resolve({
        request: {},
        runModel: async function* () {
          yield 'Hello, World!';
          return await Promise.resolve({ response: 'Hello, World!', latencyMillis: 100 });
        },
      });
    },
    extractOutput(response: unknown) {
      return Promise.resolve(response as string);
    },
    extractTokenUsage(): TokenUsage {
      return { totalTokens: 10, costDollars: 0.01 };
    },
  };

  const mockContext: RunContext = {
    abortSignal: new AbortController().signal,
  };

  async function runPipelineTest(env: PipelineEnvironment, vars = {}): Promise<TestOutput | null> {
    const generator = env.run(vars, mockContext);
    let finalResult: TestOutput | null = null;

    for await (const update of generator) {
      // The final result will be a TestOutput object
      if (typeof update === 'object') {
        finalResult = update as TestOutput;
      }
    }

    return finalResult;
  }

  test('applies string transform to pipeline step output', {}, async function () {
    const pipeline: NormalizedPipelinePrompt = {
      $pipeline: [
        {
          id: 'step-0',
          prompt: 'Say hello',
          transform: dedent`
            function execute(output) {
              return output.toUpperCase();
            }
          `,
          outputAs: 'greeting',
        },
      ],
    };

    const env = new PipelineEnvironment({
      models: { default: mockProvider },
      pipeline,
    });

    const result = await runPipelineTest(env);
    expect(result?.output).toBe('HELLO, WORLD!');
    expect(result?.error).toBeUndefined();
  });

  test('transform has access to variables', {}, async function () {
    const pipeline: NormalizedPipelinePrompt = {
      $pipeline: [
        {
          id: 'step-0',
          prompt: 'Say hello',
          transform: dedent`
            function execute(output, context) {
              return output + ' from ' + context.vars.name;
            }
          `,
          outputAs: 'greeting',
        },
      ],
    };

    const env = new PipelineEnvironment({
      models: { default: mockProvider },
      pipeline,
    });

    const result = await runPipelineTest(env, { name: 'Alice' });
    expect(result?.output).toBe('Hello, World! from Alice');
    expect(result?.error).toBeUndefined();
  });

  test('transform error is handled gracefully', {}, async function () {
    const pipeline: NormalizedPipelinePrompt = {
      $pipeline: [
        {
          id: 'step-0',
          prompt: 'Say hello',
          transform: dedent`
            function execute(output) {
              throw new Error('Transform failed intentionally');
            }
          `,
          outputAs: 'greeting',
        },
      ],
    };

    const env = new PipelineEnvironment({
      models: { default: mockProvider },
      pipeline,
    });

    const result = await runPipelineTest(env);
    expect(result?.error).toContain('Transform failed: Transform failed intentionally');
  });

  test('transform validates return type', {}, async function () {
    const pipeline: NormalizedPipelinePrompt = {
      $pipeline: [
        {
          id: 'step-0',
          prompt: 'Say hello',
          transform: dedent`
            function execute(output) {
              return 42; // Invalid return type
            }
          `,
          outputAs: 'greeting',
        },
      ],
    };

    const env = new PipelineEnvironment({
      models: { default: mockProvider },
      pipeline,
    });

    const result = await runPipelineTest(env);
    expect(result?.error).toContain('Transform must return string or array of strings/Blobs');
  });

  test('transform works with array output', {}, async function () {
    // Mock provider that returns array output
    const arrayMockProvider: ModelProvider = {
      ...mockProvider,
      extractOutput() {
        return Promise.resolve(['Hello', 'World']);
      },
    };

    const pipeline: NormalizedPipelinePrompt = {
      $pipeline: [
        {
          id: 'step-0',
          prompt: 'Say hello',
          transform: dedent`
            function execute(output) {
              return output.map(s => s.toUpperCase());
            }
          `,
          outputAs: 'greeting',
        },
      ],
    };

    const env = new PipelineEnvironment({
      models: { default: arrayMockProvider },
      pipeline,
    });

    const result = await runPipelineTest(env);
    expect(result?.output).toEqual(['HELLO', 'WORLD']);
    expect(result?.error).toBeUndefined();
  });

  test('transform works with CodeReference (file reference)', {}, async function () {
    // Create a CodeReference for the transform
    const transformCodeRef = await toCodeReference(dedent`
      function execute(output, context) {
        return 'Transformed: ' + output + ' (var: ' + context.vars.testVar + ')';
      }
    `);

    const pipeline: NormalizedPipelinePrompt = {
      $pipeline: [
        {
          id: 'step-0',
          prompt: 'Say hello',
          transform: transformCodeRef,
          outputAs: 'greeting',
        },
      ],
    };

    const env = new PipelineEnvironment({
      models: { default: mockProvider },
      pipeline,
    });

    const result = await runPipelineTest(env, { testVar: 'test123' });
    expect(result?.output).toBe('Transformed: Hello, World! (var: test123)');
    expect(result?.error).toBeUndefined();
  });
});
