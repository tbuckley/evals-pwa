import { describe, test, expect } from 'vitest';
import { PipelineEnvironment } from './PipelineEnvironment';
import { EchoProvider } from '$lib/providers/echo';
import type { NormalizedPipelinePrompt, VarSet } from '$lib/types';

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

    expect(output.output).toEqual(['Hello world! Hi world.']);
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

    expect(output.output).toEqual(['C=A=foo + B=bar']);
    expect(output.error).toBeUndefined();
  });

  test('handles loops', {}, async function () {
    const output = await runPipeline(
      {
        $pipeline: [
          {
            id: 'step-0',
            deps: ['b'],
            if: 'function execute(vars) {return vars.b?.[0]?.length < 5;}',
            prompt: '{{b}}A',
            outputAs: 'a',
          },
          { id: 'step-1', deps: ['a'], prompt: '{{a}}B', outputAs: 'b' },
        ],
      },
      { a: '>' },
    );

    expect(output.output).toEqual(['>BABAB']);
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

    expect(output.output).toEqual(['>AB>A>ABAB>A>ABA>AB>A>ABABAB']);
    expect(output.error).toBeUndefined();
  });

  test('handles function calls and parses JSON output', {}, async function () {
    const output = await runPipeline(
      {
        $pipeline: [
          {
            id: 'step-0',
            session: 'caller',
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
    expect(output.output).toEqual(['{"out":"hello"}{"out":"world"}']);
  });

  test('handles nested function calls', {}, async function () {
    const output = await runPipeline(
      {
        $pipeline: [
          {
            id: 'step-0',
            session: 'caller',
            prompt: `[
                {"type": "function-call", "name": "foo", "args": {"val": "hello"}}
            ]`,
          },
          {
            id: 'step-1',
            session: true,
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
    expect(output.output).toEqual(['{"result":["hello world!"]}']);
  });

  test('support multi-step function without polluting pipeline vars', {}, async function () {
    const output = await runPipeline(
      {
        $pipeline: [
          {
            id: 'step-0',
            session: 'caller',
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
    expect(output.output).toEqual(['{"result":["hello world!"]} the end']);
  });

  test('calls session-based functions with separate sessions', {}, async function () {
    const output = await runPipeline(
      {
        $pipeline: [
          {
            id: 'step-0',
            session: 'caller',
            prompt: `[
                {"type": "function-call", "name": "foo", "args": {"val": "hello"}}
            ]`,
            outputAs: 'foo',
          },
          {
            id: 'step-1',
            session: 'caller-2',
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
            session: true,
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
    expect(output.output).toEqual(['{"result":["hello...!"]}{"result":["world...!"]}']);
  });
});
