import { describe, test, expect } from 'vitest';
import { PipelineEnvironment } from './PipelineEnvironment';
import { EchoProvider } from '$lib/providers/echo';
import { conversationToSinglePrompt } from '$lib/providers/legacyProvider';
import type {
  ConversationPrompt,
  ExtractedOutputPart,
  MetaProviderOutputPart,
  ModelProvider,
  NormalizedPipelinePrompt,
  RunContext,
  TokenUsage,
  VarSet,
} from '$lib/types';

async function runPipeline(pipeline: NormalizedPipelinePrompt, vars: VarSet) {
  const env = new PipelineEnvironment({
    models: {
      default: new EchoProvider('echo'),
    },
    pipeline,
  });

  const abortController = new AbortController();
  const generator = env.run(vars, { abortSignal: abortController.signal });

  let next = await generator.next();
  while (!next.done) {
    next = await generator.next();
  }
  return next.value;
}

async function runPipelineWithProvider(
  pipeline: NormalizedPipelinePrompt,
  vars: VarSet,
  provider: ModelProvider,
) {
  const env = new PipelineEnvironment({
    models: {
      default: provider,
    },
    pipeline,
  });

  const abortController = new AbortController();
  const generator = env.run(vars, { abortSignal: abortController.signal });

  let next = await generator.next();
  while (!next.done) {
    next = await generator.next();
  }
  return next.value;
}

const finishMeta = {
  type: 'meta',
  title: 'Finish Reason',
  icon: 'other',
  message: 'SUCCESS',
};

describe('PipelineEnvironment', () => {
  test('handles multiple step pipelines', {}, async function () {
    const output = await runPipeline(
      {
        $pipeline: [
          { id: 'step-0', prompt: 'Hello {{target}}' },
          { id: 'step-1', prompt: '{{$output}}!' },
          { id: 'step-2', prompt: '{{$output}} Hi {{target}}.' },
        ],
      },
      { target: 'world' },
    );

    expect(output.output).toEqual(['Hello world! Hi world.', finishMeta]);
    expect(output.error).toBeUndefined();
  });

  test('handles parallel steps', {}, async function () {
    const output = await runPipeline(
      {
        $pipeline: [
          { id: 'step-0', deps: [], prompt: 'A={{a}}', outputAs: 'a_' },
          { id: 'step-1', deps: [], prompt: 'B={{b}}', outputAs: 'b_' },
          { id: 'step-2', deps: ['a_', 'b_'], prompt: 'C={{a_}} + {{b_}}' },
        ],
      },
      { a: 'foo', b: 'bar' },
    );

    expect(output.output).toEqual(['C=A=foo + B=bar', finishMeta]);
    expect(output.error).toBeUndefined();
  });

  test('handles loops', {}, async function () {
    const output = await runPipeline(
      {
        $pipeline: [
          {
            id: 'step-0',
            deps: ['b'],
            if: 'function execute(vars) {return vars.b?.length < 5;}',
            prompt: '{{b}}A',
            outputAs: 'a',
          },
          { id: 'step-1', deps: ['a'], prompt: '{{a}}B', outputAs: 'b' },
        ],
      },
      { a: '>' },
    );

    expect(output.output).toEqual(['>BABAB', finishMeta]);
    expect(output.error).toBeUndefined();
  });

  test('handles sessions', {}, async function () {
    const output = await runPipeline(
      {
        // A: (0) >A - (2) >A>ABA - (4) >A>ABA>AB>A>ABABA
        // B: (1) >AB - (3) >AB>A>ABAB - (5) >AB>A>ABAB>A>ABA>AB>A>ABABAB
        $pipeline: [
          {
            id: 'tom',
            session: 'tom',
            if: 'function execute(vars) {return vars.$history.length < 5;}',
            deps: ['dougMessage'],
            prompt: '{{dougMessage}}A',
            outputAs: 'tomMessage',
          },
          {
            id: 'doug',
            session: 'doug',
            deps: ['tomMessage'],
            prompt: '{{tomMessage}}B',
            outputAs: 'dougMessage',
          },
        ],
      },
      { dougMessage: '>' },
    );

    expect(output.output).toEqual(['>AB>A>ABAB>A>ABA>AB>A>ABABAB', finishMeta]);
    expect(output.error).toBeUndefined();
  });

  test('does not require sessions for legacy providers by default', {}, async function () {
    class LegacyProvider implements ModelProvider {
      readonly id = 'legacy:test';

      run(conversation: ConversationPrompt, _context: RunContext) {
        const prompt = conversationToSinglePrompt(conversation);
        return {
          request: { input: prompt },
          runModel: async function* () {
            yield '';
            await Promise.resolve();
            return { response: { prompt } };
          },
        };
      }

      extractOutput(response: unknown): ExtractedOutputPart[] {
        const prompt = response as { prompt: string[] };
        const meta: MetaProviderOutputPart = {
          type: 'meta',
          title: 'Finish Reason',
          icon: 'other',
          message: 'SUCCESS',
        };
        return [JSON.stringify(prompt), meta];
      }

      extractTokenUsage(): TokenUsage {
        return { inputTokens: 0, outputTokens: 0, totalTokens: 0, costDollars: 0 };
      }
    }

    const output = await runPipelineWithProvider(
      {
        $pipeline: [{ id: 'step-0', prompt: 'hello' }],
      },
      {},
      new LegacyProvider(),
    );

    expect(output.error).toBeUndefined();
  });

  test('handles function calls and parses JSON output', {}, async function () {
    const output = await runPipeline(
      {
        $pipeline: [
          {
            id: 'step-0',
            prompt: `[
                {"type": "function-call", "name": "foo", "args": {"val": "hello"}},
                {"type": "function-call", "name": "foo", "args": {"val": "world"}}
            ]`,
          },
          {
            id: 'step-1',
            deps: ['$fn:foo'],
            prompt: '{"out": "{{$args.val}}" }',
          },
        ],
      },
      {},
    );

    expect(output.error).toBeUndefined();
    expect(output.output).toEqual(['{"out":"hello"}{"out":"world"}', finishMeta]);
  });

  test('handles nested function calls', {}, async function () {
    const output = await runPipeline(
      {
        $pipeline: [
          {
            id: 'step-0',
            prompt: `[
                {"type": "function-call", "name": "foo", "args": {"val": "hello"}}
            ]`,
          },
          {
            id: 'step-1',
            deps: ['$fn:foo'],
            prompt: `[
                {"type": "function-call", "name": "bar", "args": {"val": "{{$args.val}} world"}}
            ]`,
          },
          {
            id: 'step-2',
            deps: ['$fn:bar'],
            prompt: '{{$args.val}}!',
          },
        ],
      },
      {},
    );

    expect(output.error).toBeUndefined();
    expect(output.output).toEqual(['"hello world!"', finishMeta]);
  });

  test('support multi-step function without polluting pipeline vars', {}, async function () {
    const output = await runPipeline(
      {
        $pipeline: [
          {
            id: 'step-0',
            prompt: `[
                {"type": "function-call", "name": "foo", "args": {"val": "hello"}}
            ]`,
          },
          {
            id: 'step-1',
            prompt: '{{$output}} {{bar}}',
          },
          {
            id: 'fn-1',
            deps: ['$fn:foo'],
            prompt: '{{$args.val}} world',
            outputAs: 'bar',
          },
          {
            id: 'fn-2',
            prompt: '{{bar}}!',
          },
        ],
      },
      {
        bar: 'the end',
      },
    );

    expect(output.error).toBeUndefined();
    expect(output.output).toEqual(['"hello world!" the end', finishMeta]);
  });

  test('calls session-based functions with separate sessions', {}, async function () {
    const output = await runPipeline(
      {
        $pipeline: [
          {
            id: 'step-0',
            prompt: `[
                {"type": "function-call", "name": "foo", "args": {"val": "hello"}}
            ]`,
            outputAs: 'foo',
          },
          {
            id: 'step-1',
            prompt: `[
                {"type": "function-call", "name": "foo", "args": {"val": "world"}}
            ]`,
            outputAs: 'bar',
          },
          {
            id: 'step-2',
            prompt: '{{foo}}{{bar}}',
          },
          {
            id: 'fn-1',
            session: 'fn-1',
            deps: ['$fn:foo'],
            prompt: `[
                {"type": "function-call", "name": "bar", "args": {"val": "{{$args.val}}..."}}
            ]`,
          },
          {
            id: 'fn-2',
            deps: ['$fn:bar'],
            prompt: '{{$args.val}}!',
          },
        ],
      },
      {},
    );

    expect(output.error).toBeUndefined();
    expect(output.output).toEqual(['"hello...!""world...!"', finishMeta]);
  });

  test('skips calling functions if not defined', {}, async function () {
    const output = await runPipeline(
      {
        $pipeline: [
          {
            id: 'step-0',
            prompt: `[
                {"type": "function-call", "name": "foo", "args": {"val": "hello"}}
            ]`,
            outputAs: 'foo',
          },
        ],
      },
      {},
    );

    expect(output.error).toBeUndefined();
    expect(output.output).toEqual([
      { type: 'function-call', name: 'foo', args: { val: 'hello' } },
      finishMeta,
    ]);
  });

  test('skips calling functions if functionCalls is "never"', {}, async function () {
    const output = await runPipeline(
      {
        $pipeline: [
          {
            id: 'step-0',
            prompt: `[
                {"type": "function-call", "name": "foo", "args": {"val": "hello"}}
            ]`,
            outputAs: 'foo',
            functionCalls: 'never',
          },
          {
            id: 'fn-foo',
            deps: ['$fn:foo'],
            prompt: '{{$args.val}}!',
          },
        ],
      },
      {},
    );

    expect(output.error).toBeUndefined();
    expect(output.output).toEqual([
      { type: 'function-call', name: 'foo', args: { val: 'hello' } },
      finishMeta,
    ]);
  });

  test('supports transform functions', {}, async function () {
    const output = await runPipeline(
      {
        $pipeline: [
          {
            id: 'step-0',
            prompt: 'Hello {{target}}',
            transform: 'function execute(output) { return output.toUpperCase() }',
          },
          { id: 'step-1', transform: 'function execute(output) { return output + "!" }' },
          { id: 'step-2', prompt: '{{$output}} Hi {{target}}.' },
        ],
      },
      { target: 'world' },
    );

    expect(output.output).toEqual(['HELLO WORLD! Hi world.', finishMeta]);
    expect(output.error).toBeUndefined();
  });

  test('supports transform functions with no prompt', {}, async function () {
    const output = await runPipeline(
      {
        $pipeline: [
          {
            id: 'set-2',
            transform: 'function execute(output) { return "2"; }',
          },
          {
            id: 'mult-3',
            transform: 'function execute(output) { return (parseInt(output)*3).toString(); }',
          },
          {
            id: 'add-4',
            transform: 'function execute(output) { return (parseInt(output)+4).toString(); }',
          },
        ],
      },
      { target: 'world' },
    );

    expect(output.output).toEqual('10');
    expect(output.error).toBeUndefined();
  });

  test('supports state', {}, async function () {
    const output = await runPipeline(
      {
        $pipeline: [
          {
            id: 'set-value',
            state: ['value'],
            transform:
              'function execute(output, {vars}) { return {vars: { $state: { value: vars.$state.value + 1 } } }; }',
          },
          {
            id: 'print-value',
            state: ['value'],
            prompt: '{{$state.value}}',
          },
        ],
      },
      { $state: { value: 41 } },
    );

    expect(output.error).toBeUndefined();
    expect(output.output).toEqual(['42', finishMeta]);
  });

  test('cannot read state without declaration', {}, async function () {
    const output = await runPipeline(
      {
        $pipeline: [
          {
            id: 'print-value',
            prompt: 'Value: {{$state.value}}',
          },
        ],
      },
      { $state: { value: 42 } },
    );

    expect(output.output).toEqual(['Value: ', finishMeta]);
    expect(output.error).toBeUndefined();
  });

  test('transforms can return Blob vars', {}, async function () {
    const output = await runPipeline(
      {
        $pipeline: [
          {
            id: 'create-blob',
            transform: "function execute() { return {vars: { foo: new Blob(['hello']) } }; }",
          },
          {
            id: 'print-uri',
            transform: 'function execute(output, {vars}) { return vars.foo.file.text(); }',
          },
        ],
      },
      {},
    );

    expect(output.output).toEqual('hello');
    expect(output.error).toBeUndefined();
  });
});
