import { derived, get } from 'svelte/store';
import { configStore, liveRunStore, runStore, selectedRunIdStore } from './stores';
import { ProviderManager } from '$lib/providers/ProviderManager';
import { envStore } from './env';
import type { LiveRun, Run } from '$lib/types';

function parseEnvText(env: string): Record<string, string> {
	// Given a series of key=value pairs separated by newlines, create an object
	// Ignore lines starting with #
	const lines = env.split('\n');
	const res: Record<string, string> = {};
	for (const line of lines) {
		if (line.startsWith('#')) {
			continue;
		}
		const index = line.indexOf('=');
		if (index === -1) {
			console.warn(`Invalid line in env: ${line}`);
			continue;
		}
		const key = line.slice(0, index);
		const value = line.slice(index + 1);
		res[key] = value;
	}
	return res;
}

export const parsedEnvStore = derived(envStore, ($env) => {
	return parseEnvText($env);
});

export const requiredEnvStore = derived(configStore, ($config) => {
	const requiredEnvVars = new Set<string>();
	const providers = $config?.providers ?? [];
	const mgr = new ProviderManager({});
	for (const provider of providers) {
		const providerId = typeof provider === 'string' ? provider : provider.id;
		const envVars = mgr.getRequiredEnvVars(providerId);
		for (const envVar of envVars) {
			requiredEnvVars.add(envVar);
		}
	}

	const tests = $config?.tests ?? [];
	for (const test of tests) {
		const asserts = test.assert ?? [];
		for (const assertion of asserts) {
			const vars = assertion.vars ?? {};
			if ('provider' in vars && typeof vars['provider'] === 'string') {
				// TODO support other types of provider
				const providerId = vars['provider'];
				const envVars = mgr.getRequiredEnvVars(providerId);
				for (const envVar of envVars) {
					requiredEnvVars.add(envVar);
				}
			}
		}
	}

	return Array.from(requiredEnvVars).sort();
});

export const validEnvStore = derived([requiredEnvStore, parsedEnvStore], ([$requiredEnv, $env]) => {
	for (const key of $requiredEnv) {
		if (!$env[key]) {
			return false;
		}
	}
	return true;
});

export const selectedRunStore = derived(
	[liveRunStore, runStore, selectedRunIdStore],
	([$liveRuns, $runs, $selectedId]) => {
		if ($selectedId === null) {
			return null;
		}
		if ($selectedId in $liveRuns) {
			return liveRunToRun($liveRuns[$selectedId]);
		}
		if ($selectedId in $runs) {
			// FIXME convert to live run
			return $runs[$selectedId];
		}
		// TODO throw error?
		return null;
	}
);

interface RunLike {
	id: string;
	timestamp: number;
	description?: string;
}
export const runTitleListStore = derived([liveRunStore, runStore], ([$liveRuns, $runs]) => {
	const objects: RunLike[] = [...Object.values($liveRuns), ...Object.values($runs)];
	const runs = objects.sort((a, b) => b.timestamp - a.timestamp);
	return runs.map((run) => ({
		id: run.id,
		title: getRunTitle(run)
	}));
});
export const selectedRunTitle = derived(selectedRunStore, ($selectedRun) => {
	if (!$selectedRun) {
		return '';
	}
	return getRunTitle($selectedRun);
});

function getRunTitle(run: RunLike): string {
	const dateFormatter = new Intl.DateTimeFormat('en-US', {
		dateStyle: 'medium',
		timeStyle: 'short'
	});
	const datetime = dateFormatter.format(new Date(run.timestamp));
	if (run.description) {
		return `${run.description} (${datetime})`;
	}
	return datetime;
}

function liveRunToRun(liveRun: LiveRun): Run {
	return {
		version: 1,
		...liveRun,
		results: liveRun.results.map((row) =>
			row.map((store) => {
				const res = get(store);
				return {
					...res,
					state: undefined,
					pass: res.state === 'success',
					assertionResults: res.assertionResults ?? []
				};
			})
		)
	};
}
