import type { AssertionStats, SummaryStats, TestResult } from '$lib/types';
import { cast } from './asserts';

export type ResultLike = Omit<TestResult, 'pass' | 'assertionResults'> & {
  assertionResults?: TestResult['assertionResults'];
};

export function summarizeResults<T extends ResultLike>(
  results: T[],
  passFn: (r: T) => boolean | null,
): SummaryStats {
  const total = results.length;
  const passed = results.filter((r) => passFn(r) === true).length;
  const failed = results.filter((r) => passFn(r) === false).length;
  const assertions = summarizeAssertionResults(results);

  const stats: SummaryStats = {
    total,
    passed,
    failed,
    assertions,
  };

  const hasLatency = results.some((r) => r.latencyMillis !== undefined);
  if (hasLatency) {
    const latencies = results
      .filter((r) => r.latencyMillis !== undefined)
      .map((r) => r.latencyMillis ?? 0);
    const sum = latencies.reduce((a, b) => a + b, 0);
    stats.avgLatencyMillis = sum / total;
  }

  const hasCost = results.some((r) => r.tokenUsage?.costDollars !== undefined);
  if (hasCost) {
    const costs = results
      .filter((r) => r.tokenUsage?.costDollars !== undefined)
      .map((r) => r.tokenUsage?.costDollars ?? 0);
    const sum = costs.reduce((a, b) => a + b, 0);
    stats.avgCostDollars = sum / total;
  }

  return stats;
}

function summarizeAssertionResults(results: ResultLike[]): AssertionStats[] {
  const grouped = new Map<
    string,
    {
      passCount: number;
      totalCount: number;
      outputStats: Map<string, { values: (boolean | number)[]; type: string }>;
    }
  >();

  results.forEach((result) => {
    result.assertionResults?.forEach((assertion) => {
      if (assertion.id) {
        if (!grouped.has(assertion.id)) {
          grouped.set(assertion.id, {
            passCount: 0,
            totalCount: 0,
            outputStats: new Map(),
          });
        }

        const group = cast(grouped.get(assertion.id));
        group.totalCount += 1;
        if (assertion.pass) {
          group.passCount += 1;
        }

        Object.entries(assertion.outputs ?? {}).forEach(([key, value]) => {
          const type = typeof value;
          if (!['boolean', 'number'].includes(type)) {
            // Skip invalid types.
            return;
          }
          if (!group.outputStats.has(key)) {
            group.outputStats.set(key, {
              values: [value],
              type,
            });
          } else {
            const summary = cast(group.outputStats.get(key));

            if (summary.type !== type) {
              // Skip mismatched types.
            } else {
              summary.values.push(value);
            }
          }
        });
      }
    });
  });

  const assertionStats: AssertionStats[] = Array.from(grouped.entries()).map(
    ([id, { passCount, totalCount, outputStats }]) => {
      const summarizedOutputs: Record<
        string,
        { type: 'boolean'; avgTrue: number } | { type: 'number'; avgNumber: number }
      > = {};

      outputStats.forEach(({ values, type }, key) => {
        if (type === 'boolean') {
          const avgTrue = values.filter((v) => v === true).length / values.length;
          summarizedOutputs[key] = { type: 'boolean', avgTrue };
        } else if (type === 'number') {
          const avgNumber = (values as number[]).reduce((acc, v) => acc + v, 0) / values.length;
          summarizedOutputs[key] = { type: 'number', avgNumber };
        }
      });

      return {
        description: id,
        avgPass: passCount / totalCount,
        outputStats: summarizedOutputs,
      };
    },
  );

  return assertionStats;
}
