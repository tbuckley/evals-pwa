import { describe, expect, test } from 'vitest';
import { generateCsvContent } from './csvExport';
import type { LiveRun } from '../types';
import { readable } from 'svelte/store';

// Helper function to create a simplified mock LiveRun for testing
function createTestLiveRun(): LiveRun {
  return {
    id: 'test-run-1',
    timestamp: 1234567890,
    description: 'Test Run',
    canceled: false,
    envs: [
      {
        provider: 'openai:gpt-3.5-turbo',
        prompt: 'Test prompt 1',
      },
      {
        provider: { id: 'anthropic:claude-3', labels: ['test'] },
        prompt: 'Test prompt 2',
      },
    ],
    tests: [
      {
        description: 'Test case 1',
        vars: { var1: 'value1', var2: 'value2' },
      },
      {
        description: 'Test case 2',
        vars: { var1: 'value3', var2: 42 },
      },
    ],
    varNames: ['var1', 'var2'],
    summaries: [
      readable({ total: 2, passed: 1, failed: 1, assertions: [] }),
      readable({ total: 2, passed: 2, failed: 0, assertions: [] }),
    ],
    results: [
      [
        readable({
          state: 'success' as const,
          output: ['Result 1 for env 1'],
          rawPrompt: 'Raw prompt 1',
          latencyMillis: 100,
          assertionResults: [],
        }),
        readable({
          state: 'error' as const,
          error: 'Error in env 2',
          rawPrompt: 'Raw prompt 2',
          assertionResults: [],
        }),
      ],
      [
        readable({
          state: 'success' as const,
          output: ['Result 2 for env 1'],
          rawPrompt: 'Raw prompt 3',
          latencyMillis: 150,
          assertionResults: [],
        }),
        readable({
          state: 'success' as const,
          output: ['![](file://test.jpg)'],
          rawPrompt: 'Raw prompt 4',
          assertionResults: [],
        }),
      ],
    ],
  };
}

describe('csvExport', () => {
  test('generates CSV with correct structure', () => {
    const run = createTestLiveRun();
    const csv = generateCsvContent(run);
    const lines = csv.split('\n');

    // Should have 5 lines: header, provider, prompt, and 2 data rows
    expect(lines).toHaveLength(5);

    // Check header structure
    expect(lines[0]).toBe('"Test","var1","var2","openai:gpt-3.5-turbo","anthropic:claude-3"');

    // Check provider row
    expect(lines[1]).toBe('"Provider","","","openai:gpt-3.5-turbo","anthropic:claude-3"');

    // Check prompt row
    expect(lines[2]).toBe('"Prompt","","","Test prompt 1","Test prompt 2"');
  });

  test('includes variable values in correct order', () => {
    const run = createTestLiveRun();
    const csv = generateCsvContent(run);
    const lines = csv.split('\n');

    // Check first data row
    expect(lines[3]).toBe('"Test case 1","value1","value2","Result 1 for env 1","Error in env 2"');

    // Check second data row - number should be stringified
    expect(lines[4]).toBe(
      '"Test case 2","value3","42","Result 2 for env 1","![](file://test.jpg)"',
    );
  });

  test('handles different output types correctly', () => {
    const run = createTestLiveRun();
    // Modify the run to test different output types
    run.results = [
      [
        readable({ state: 'success' as const, output: undefined }),
        readable({ state: 'success' as const, output: ['String output'] }),
      ],
    ];
    run.tests = [{ description: 'Output test' }];

    const csv = generateCsvContent(run);
    const lines = csv.split('\n');

    expect(lines[3]).toBe('"Output test","","","--no output--","String output"');
  });

  test('handles null and undefined variable values', () => {
    const run = createTestLiveRun();
    run.tests = [
      {
        description: 'Test with null/undefined vars',
        vars: { var1: null, var2: undefined },
      },
    ];
    run.results = [
      [
        readable({ state: 'success' as const, output: ['test'] }),
        readable({ state: 'success' as const, output: ['test'] }),
      ],
    ];

    const csv = generateCsvContent(run);
    const lines = csv.split('\n');

    // Check that null and undefined are converted to empty strings
    expect(lines[3]).toBe('"Test with null/undefined vars","","","test","test"');
  });

  test('handles complex object variables by JSON stringifying them', () => {
    const run = createTestLiveRun();
    run.tests = [
      {
        description: 'Test with object var',
        vars: { var1: { nested: { value: 'test' } }, var2: [1, 2, 3] },
      },
    ];
    run.results = [
      [
        readable({ state: 'success' as const, output: ['test'] }),
        readable({ state: 'success' as const, output: ['test'] }),
      ],
    ];

    const csv = generateCsvContent(run);
    const lines = csv.split('\n');

    expect(lines[3]).toBe(
      '"Test with object var","{""nested"":{""value"":""test""}}","[1,2,3]","test","test"',
    );
  });

  test('properly escapes quotes in CSV content', () => {
    const run = createTestLiveRun();
    run.tests = [
      {
        description: 'Test with "quotes"',
        vars: { var1: 'Value with "quotes"', var2: 'normal' },
      },
    ];
    run.results = [
      [
        readable({ state: 'success' as const, output: ['Output with "quotes"'] }),
        readable({ state: 'success' as const, output: ['Normal output'] }),
      ],
    ];

    const csv = generateCsvContent(run);
    const lines = csv.split('\n');

    expect(lines[3]).toBe(
      '"Test with ""quotes""","Value with ""quotes""","normal","Output with ""quotes""","Normal output"',
    );
  });

  test('handles unknown provider types', () => {
    const run = createTestLiveRun();
    run.envs = [{ provider: null, prompt: 'test prompt' }];
    run.tests = [{ description: 'Test' }];
    run.results = [[readable({ state: 'success' as const, output: ['test'] })]];

    const csv = generateCsvContent(run);
    const lines = csv.split('\n');

    expect(lines[0]).toBe('"Test","var1","var2","unknown"');
    expect(lines[1]).toBe('"Provider","","","unknown"');
  });

  test('does not include notes columns when includeNotes is false', () => {
    const run = createTestLiveRun();

    const csv = generateCsvContent(run, {
      includeNotes: false,
      annotations: null,
    });
    const lines = csv.split('\n');

    // Should not include notes columns
    expect(lines[0]).toBe('"Test","var1","var2","openai:gpt-3.5-turbo","anthropic:claude-3"');
  });

  test('handles empty variable names array', () => {
    const run = createTestLiveRun();
    run.varNames = [];
    run.tests = [{ description: 'Simple test' }, { description: 'Another test' }];

    const csv = generateCsvContent(run);
    const lines = csv.split('\n');

    expect(lines[0]).toBe('"Test","openai:gpt-3.5-turbo","anthropic:claude-3"');
    expect(lines[1]).toBe('"Provider","openai:gpt-3.5-turbo","anthropic:claude-3"');
    expect(lines[2]).toBe('"Prompt","Test prompt 1","Test prompt 2"');
  });
});
