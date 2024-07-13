import { get } from 'svelte/store';
import { configStore, runStore, storageStore } from './stores';
import type {
	AssertionResult,
	ModelProvider,
	Prompt,
	Provider,
	Run,
	TestCase,
	TestEnvironment,
	TestResult
} from '$lib/types';
import { ProviderManager } from '$lib/providers/ProviderManager';
import { envStore } from './env';
import { SimpleEnvironment } from '$lib/utils/SimpleEnvironment';
import { HandlebarsPromptFormatter } from '$lib/utils/HandlebarsPromptFormatter';
import { ParallelTaskQueue } from '$lib/utils/ParallelTaskQueue';

export async function loadStateFromStorage(): Promise<void> {
	const storage = get(storageStore);
	if (!storage) return;

	const [config, runs] = await Promise.all([storage.getConfig(), storage.getAllRuns()]);

	// If the storage has changed since the request was made, ignore the results
	if (get(storageStore) !== storage) return;

	configStore.set(config);
	runStore.set(runs);
}

function parseEnvText(env: string): Record<string, string> {
	// Given a series of key=value pairs separated by newlines, create an object
	// Ignore lines starting with #
	const lines = env.split('\n');
	const res: Record<string, string> = {};
	for (const line of lines) {
		if (line.startsWith('#')) continue;
		const index = line.indexOf('=');
		if (index === -1) {
			throw new Error(`Invalid line in env: ${line}`);
		}
		const key = line.slice(0, index);
		const value = line.slice(index + 1);
		res[key] = value;
	}
	return res;
}

export async function runTests() {
	const config = get(configStore);
	if (!config) {
		throw new Error('Cannot call runTests without a config');
	}
	const storage = get(storageStore);
	if (!storage) {
		throw new Error('Cannot call runTests without a storage');
	}

	// Create the provider manager
	const env = get(envStore); // TODO validate that env variables for each provider is set
	const providerManager = new ProviderManager(parseEnvText(env));

	// Create the test runner
	const runner = new ParallelTaskQueue(5);

	// Get global prompts + tests
	const globalPrompts: Prompt[] = config.prompts ?? [];
	const globalTests: TestCase[] = config.tests ?? [];
	const globalProviders: Provider[] = config.providers ?? [];

	// Create environments
	const envs: TestEnvironment[] = [];
	const runEnvs: { provider: Provider; prompt: Prompt }[] = [];
	for (const provider of globalProviders) {
		let model: ModelProvider;
		if (typeof provider === 'string') {
			model = providerManager.getProvider(provider);
		} else {
			// TODO also allow custom model properties
			model = providerManager.getProvider(provider.id);
		}

		// First use any provider-specific prompts; otherwise, use the global prompts
		const prompts: Prompt[] =
			typeof provider === 'object' && provider.prompts ? provider.prompts : globalPrompts;
		for (const prompt of prompts) {
			envs.push(
				new SimpleEnvironment({
					model,
					prompt: new HandlebarsPromptFormatter(prompt),
					loader: storage
				})
			);
			runEnvs.push({ provider, prompt });
		}
	}

	const run: Run = {
		version: 1,
		id: 'TODO',
		timestamp: Date.now(),
		envs: runEnvs,
		tests: globalTests,
		results: []
	};

	// Run tests
	for (const test of globalTests) {
		const testResults: TestResult[] = [];
		for (const env of envs) {
			const result: TestResult = { pass: false, assertionResults: [] };
			testResults.push(result);

			runner.enqueue(async () => {
				// TODO should this be safeRun if it will catch all errors?
				const output = await env.run(test.vars ?? {});
				for (const [key, value] of Object.entries(output)) {
					(result as { [key: string]: unknown })[key] = value;
				}

				if (output.error) {
					result.pass = false;
					return;
				}

				// Run
				const assertions = test.assert ?? [];
				const assertionResults: AssertionResult[] = [];
				for (const assertion of assertions) {
					if (assertion.type === 'icontains') {
						const pass = output
							.output!.toLocaleLowerCase()
							.includes((assertion.vars!.needle as string).toLocaleLowerCase());
						assertionResults.push({ pass, message: pass ? 'String found' : 'String not found' });
					}
				}
				result.pass = assertionResults.every((r) => r.pass);
				result.assertionResults = assertionResults;
			});
		}
		run.results.push(testResults);
	}

	await runner.completed();

	runStore.update((runs) => [...runs, run]);

	// Save the run to storage
	storage.addRun(run);
}
