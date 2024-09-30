import { describe, test, expect } from 'vitest';
import { summarizeResults, type ResultLike } from '$lib/utils/summarizeResults';

describe('summarizeResults', () => {
  test('basic', () => {
    const results = [
      { pass: true, latencyMillis: 100, tokenUsage: { costDollars: 0.01 } },
      { pass: false, latencyMillis: 200, tokenUsage: { costDollars: 0.02 } },
      { pass: true, latencyMillis: 300, tokenUsage: { costDollars: 0.03 } },
    ];

    const stats = summarizeResults(results, (r) => r.pass);

    expect(stats).toEqual({
      total: 3,
      passed: 2,
      failed: 1,
      assertions: [],
      avgLatencyMillis: 200,
      avgCostDollars: 0.02,
    });
  });

  test('assertions', () => {
    const results: (ResultLike & { pass: boolean })[] = [
      {
        pass: true,
        assertionResults: [
          { id: 'a', pass: true, outputs: { wordCount: 10 } },
          { id: 'b', pass: false, outputs: { hasKeywords: false } },
        ],
      },
      {
        pass: false,
        assertionResults: [
          { id: 'a', pass: true, outputs: { wordCount: 15 } },
          { id: 'b', pass: true, outputs: { hasKeywords: true } },
        ],
      },
    ];

    const stats = summarizeResults(results, (r) => r.pass);

    expect(stats).toEqual({
      total: 2,
      passed: 1,
      failed: 1,
      assertions: [
        {
          description: 'a',
          avgPass: 1,
          outputStats: {
            wordCount: { type: 'number', avgNumber: 12.5 },
          },
        },
        {
          description: 'b',
          avgPass: 0.5,
          outputStats: {
            hasKeywords: { type: 'boolean', avgTrue: 0.5 },
          },
        },
      ],
    });
  });

  test('inconsistent output types', () => {
    const results: (ResultLike & { pass: boolean })[] = [
      {
        pass: true,
        assertionResults: [
          { id: 'a', pass: true, outputs: { wordCount: 10 } },
          { id: 'b', pass: true, outputs: { hasKeywords: true } },
        ],
      },
      {
        pass: false,
        assertionResults: [
          { id: 'a', pass: true, outputs: { wordCount: 15 } },
          { id: 'b', pass: true, outputs: { hasKeywords: 1 } },
        ],
      },
    ];

    const stats = summarizeResults(results, (r) => r.pass);

    expect(stats).toEqual({
      total: 2,
      passed: 1,
      failed: 1,
      assertions: [
        {
          description: 'a',
          avgPass: 1,
          outputStats: {
            wordCount: { type: 'number', avgNumber: 12.5 },
          },
        },
        {
          description: 'b',
          avgPass: 1,
          outputStats: {
            hasKeywords: { type: 'boolean', avgTrue: 1 },
          },
        },
      ],
    });
  });
});
