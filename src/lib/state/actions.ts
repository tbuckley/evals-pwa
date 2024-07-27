import { get } from 'svelte/store';
import { configStore, runStore, selectedRunIdStore, storageStore } from './stores';
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
import { SimpleEnvironment } from '$lib/utils/SimpleEnvironment';
import { HandlebarsPromptFormatter } from '$lib/utils/HandlebarsPromptFormatter';
import { ParallelTaskQueue } from '$lib/utils/ParallelTaskQueue';
import { AssertionManager } from '$lib/assertions/AssertionManager';
import { parsedEnvStore } from './derived';
import { FileSystemStorage } from '$lib/storage/fileSystemStorage';

export async function chooseFolder() {
	let dir: FileSystemDirectoryHandle;
	try {
		dir = await window.showDirectoryPicker({
			mode: 'readwrite',
			id: 'evals-pwa', // Remember the last used location
			startIn: 'documents' // Default to the documents folder
		});
	} catch (err) {
		console.error(err);
		return;
	}

	const storage = new FileSystemStorage(dir);
	storageStore.set(storage);
	await loadStateFromStorage();
}

export async function loadStateFromStorage(): Promise<void> {
	const storage = get(storageStore);
	if (!storage) return;

	const [config, runs] = await Promise.all([storage.getConfig(), storage.getAllRuns()]);

	// If the storage has changed since the request was made, ignore the results
	if (get(storageStore) !== storage) return;

	configStore.set(config);
	runStore.set(Object.fromEntries(runs.map((run) => [run.id, run])));
	selectedRunIdStore.set(runs.length > 0 ? runs[runs.length - 1].id : null);

	// TODO check that necessary environment variables are set
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
	const env = get(parsedEnvStore); // TODO validate that env variables for each provider is set
	const providerManager = new ProviderManager(env);

	// Create the test runner
	const runner = new ParallelTaskQueue(5);

	// Get global prompts + tests
	const globalPrompts: Prompt[] = config.prompts ?? [];
	const globalProviders: Provider[] = config.providers ?? [];
	let globalTests: TestCase[] = config.tests ?? [];
	if (config.defaultTest) {
		globalTests = globalTests.map((test) => ({
			...config.defaultTest,
			...test,
			vars: {
				...(config.defaultTest?.vars ?? {}),
				...(test.vars ?? {})
			},
			assert: [...(config.defaultTest?.assert ?? []), ...(test.assert ?? [])]
		}));
	}

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
		id: crypto.randomUUID(),
		timestamp: Date.now(),
		envs: runEnvs,
		tests: globalTests,
		results: []
	};

	// Run tests
	const mgr = new AssertionManager();
	for (const test of globalTests) {
		const testResults: TestResult[] = [];
		for (const env of envs) {
			const result: TestResult = { pass: false, assertionResults: [] };
			testResults.push(result);

			const assertions = (test.assert ?? []).map((a) => mgr.getAssertion(a));
			// TODO destroy assertions after test is complete
			const assertionResults: AssertionResult[] = [];

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
				for (const assertion of assertions) {
					console.log('Running', assertion);
					const result = await assertion.run(output.output!);
					assertionResults.push(result);
				}
				result.pass = assertionResults.every((r) => r.pass);
				result.assertionResults = assertionResults;
			});
		}
		run.results.push(testResults);
	}

	await runner.completed();
	mgr.destroy();

	runStore.update((runs) => ({
		...runs,
		[run.id]: run
	}));
	selectedRunIdStore.set(run.id);

	// Save the run to storage
	storage.addRun(run);
}
