import type { SummaryStats, TestResult } from '$lib/types';

export type ResultLike = Omit<TestResult, 'pass' | 'assertionResults'>;

export function summarizeResults<T extends ResultLike>(
	results: T[],
	passFn: (r: T) => boolean | null
): SummaryStats {
	const total = results.length;
	const passed = results.filter((r) => passFn(r) === true).length;
	const failed = results.filter((r) => passFn(r) === false).length;

	const stats: SummaryStats = {
		total,
		passed,
		failed
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
