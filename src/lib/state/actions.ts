import { get } from 'svelte/store';
import { configStore, runStore, selectedRunIdStore, storageStore } from './stores';
import type {
	AssertionResult,
	FileLoader,
	NormalizedProvider,
	NormalizedTestCase,
	PopulatedVarSet,
	Prompt,
	Provider,
	Run,
	TestEnvironment,
	TestResult,
	VarSet
} from '$lib/types';
import { ProviderManager } from '$lib/providers/ProviderManager';
import { SimpleEnvironment } from '$lib/utils/SimpleEnvironment';
import { HandlebarsPromptFormatter } from '$lib/utils/HandlebarsPromptFormatter';
import { ParallelTaskQueue } from '$lib/utils/ParallelTaskQueue';
import { AssertionManager } from '$lib/assertions/AssertionManager';
import { parsedEnvStore } from './derived';
import { alertStore, type AlertState } from './ui';
import { FileSystemEvalsStorage } from '$lib/storage/FileSystemEvalsStorage';
import { WebFileSystemStorage } from '$lib/storage/WebFileSystemStorage';

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

	const storage = new FileSystemEvalsStorage(new WebFileSystemStorage(dir));
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

export async function showPrompt(prompt: Omit<AlertState, 'callback'>): Promise<boolean> {
	let resolve: (value: boolean) => void;
	const result = new Promise<boolean>((r) => (resolve = r));
	alertStore.set({ ...prompt, callback: resolve! });
	return result;
}

export async function runTests() {
	let config = get(configStore);
	if (!config) {
		throw new Error('Cannot call runTests without a config');
	}
	const storage = get(storageStore);
	if (!storage) {
		throw new Error('Cannot call runTests without a storage');
	}

	// Check if the config is the latest
	const latestConfig = await storage.getConfig();
	if (!deepEquals(config, latestConfig)) {
		// Prompt the user to update to the latest config
		const res = await showPrompt({
			title: 'Configuration has changed',
			description:
				'The config.yaml has changed since it was last loaded. Would you like to update to the latest configuration?',
			confirmText: 'Update',
			cancelText: 'Ignore'
		});
		if (res) {
			configStore.set(latestConfig);
			config = latestConfig;
			// TODO what if the required env variables have changed?
		}
	}

	// Get global prompts + tests
	const globalPrompts: Prompt[] = config.prompts;
	const globalProviders: NormalizedProvider[] = config.providers;
	const globalTests: NormalizedTestCase[] = config.tests;

	// Create the provider manager
	const env = get(parsedEnvStore); // TODO validate that env variables for each provider is set
	const providerManager = new ProviderManager(env);

	// Create environments
	const envs: TestEnvironment[] = [];
	const runEnvs: { provider: Provider; prompt: Prompt }[] = [];
	for (const provider of globalProviders) {
		const model = providerManager.getProvider(provider.id, provider.config);

		// First use any provider-specific prompts; otherwise, use the global prompts
		const prompts: Prompt[] = provider.prompts ? provider.prompts : globalPrompts;
		for (const prompt of prompts) {
			envs.push(
				new SimpleEnvironment({
					model,
					prompt: new HandlebarsPromptFormatter(prompt)
				})
			);
			runEnvs.push({ provider, prompt });
		}
	}

	const run: Run = {
		version: 1,
		id: crypto.randomUUID(),
		timestamp: Date.now(),
		description: config.description,
		envs: runEnvs,
		tests: globalTests,
		results: []
	};

	// Request permission to show notifications
	if (Notification.permission !== 'granted') {
		// Note: not awaited so it does not delay results
		Notification.requestPermission();
	}

	// Create the test runner
	const runner = new ParallelTaskQueue(5);

	// Run tests
	const mgr = new AssertionManager(providerManager, storage);
	for (const test of globalTests) {
		const testResults: TestResult[] = [];
		for (const env of envs) {
			const result: TestResult = { pass: false, assertionResults: [] };
			testResults.push(result);

			const assertions = test.assert.map((a) => mgr.getAssertion(a, test.vars));
			// TODO destroy assertions after test is complete
			const assertionResults: AssertionResult[] = [];

			runner.enqueue(async () => {
				// TODO should this be safeRun if it will catch all errors?
				const populatedVars = await populate(test.vars, storage);
				const output = await env.run(populatedVars);
				for (const [key, value] of Object.entries(output)) {
					(result as { [key: string]: unknown })[key] = value;
				}

				if (output.error) {
					result.pass = false;
					return;
				}

				// Run
				for (const assertion of assertions) {
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

	if (document.visibilityState !== 'visible' && Notification.permission === 'granted') {
		new Notification('Eval complete', { body: 'See your results in Evals PWA.' });
	}
}

function deepEquals(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (typeof a !== typeof b) return false;
	if (typeof a !== 'object' || a === null) return false;

	const keysA = Object.keys(a);
	const keysB = Object.keys(b as { [key: string]: unknown });
	if (keysA.length !== keysB.length) return false;
	for (const key of keysA) {
		if (!keysB.includes(key)) return false;
		if (
			!deepEquals((a as { [key: string]: unknown })[key], (b as { [key: string]: unknown })[key])
		) {
			return false;
		}
	}
	return true;
}

async function populate(vars: VarSet, loader: FileLoader): Promise<PopulatedVarSet> {
	const populated: PopulatedVarSet = {};
	for (const key in vars) {
		if (vars[key].startsWith('file:///') && isSupportedImageType(vars[key])) {
			populated[key] = await loader.loadFile(vars[key]);
		} else {
			populated[key] = vars[key];
		}
	}
	return populated;
}

function isSupportedImageType(path: string): boolean {
	return path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.jpeg');
}
