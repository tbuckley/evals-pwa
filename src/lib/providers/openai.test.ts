import { describe, expect, test } from 'vitest';
import { OpenaiProvider } from './openai';

describe('OpenaiProvider', () => {
  const provider = new OpenaiProvider('gpt-test', 'test-key');

  test('extractDeltaOutput handles null and undefined', () => {
    const nullDelta = { id: '1', choices: [{ delta: { content: null } }] };
    const undefinedDelta = { id: '1', choices: [{ delta: {} }] };
    expect(provider.extractDeltaOutput(nullDelta)).toBe('');
    expect(provider.extractDeltaOutput(undefinedDelta)).toBe('');
  });

  test('extractOutput handles null and undefined', () => {
    const nullMessage = {
      id: '1',
      choices: [{ message: { role: 'assistant', content: null } }],
    };
    const undefinedMessage = {
      id: '1',
      choices: [{ message: { role: 'assistant' } }],
    };
    expect(provider.extractOutput(nullMessage)).toEqual(['']);
    expect(provider.extractOutput(undefinedMessage)).toEqual(['']);
  });
});
