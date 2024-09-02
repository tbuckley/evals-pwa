import { derived, get, writable, type Writable } from 'svelte/store';
import { configStore, liveRunStore, runStore, selectedRunIdStore, storageStore } from './stores';
import {
	UiError,
	type AssertionResult,
	type FileLoader,
	type LiveResult,
	type LiveRun,
	type NormalizedProvider,
	type NormalizedTestCase,
	type PopulatedVarSet,
	type Prompt,
	type Run,
	type TestEnvironment,
	type VarSet
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
import { getVarNamesForTests } from '$lib/utils/testCase';
import { summarizeResults } from '$lib/utils/summarizeResults';

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

	// TODO don't allow the user to select a directory if it is invalid
	await setStorageDirectory(dir);
}

export async function setStorageDirectory(dir: FileSystemDirectoryHandle) {
	const storage = new FileSystemEvalsStorage(new WebFileSystemStorage(dir));
	storageStore.set(storage);
	await loadStateFromStorage();
}

export async function loadStateFromStorage(): Promise<void> {
	const storage = get(storageStore);
	if (!storage) return;

	let config, runs;
	try {
		[config, runs] = await Promise.all([storage.getConfig(), storage.getAllRuns()]);
	} catch (err) {
		if (err instanceof UiError) {
			switch (err.detail.type) {
				case 'missing-config':
					showPrompt({
						title: 'Missing config.yaml',
						description: [`Please create ${err.detail.path} in your selected directory.`],
						cancelText: null
					});
					break;
				case 'missing-config-reference':
					showPrompt({
						title: 'Missing file',
						description: [
							`The file ${err.detail.path} referenced from your configuration does not exist.`
						],
						cancelText: null
					});
					break;
				case 'invalid-config':
					showPrompt({
						title: 'Invalid configuration',
						description: [`The config.yaml file contains errors:`, ...err.detail.errors],
						cancelText: null
					});
					break;
			}
			return;
		}
		throw err;
	}

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
			description: [
				'The config.yaml has changed since it was last loaded. Would you like to update to the latest configuration?'
			],
			confirmText: 'Update',
			cancelText: 'Ignore'
		});
		if (res) {
			configStore.set(latestConfig);
			config = latestConfig;
			// TODO what if the required env variables have changed?
		}
	}

	// Request permission to show notifications
	if (Notification.permission !== 'granted') {
		// Note: not awaited so it does not delay results
		Notification.requestPermission();
	}

	// Get global prompts + tests
	const globalPrompts: Prompt[] = config.prompts;
	const globalProviders: NormalizedProvider[] = config.providers;
	const globalTests: NormalizedTestCase[] = config.tests;

	// Create the provider manager
	const env = get(parsedEnvStore); // TODO validate that env variables for each provider is set
	const providerManager = new ProviderManager(env);

	// Create environments
	const runEnvs: RunEnv[] = getRunEnvs(globalProviders, globalPrompts);
	const envs: TestEnvironment[] = createEnvironments(runEnvs, providerManager);

	// Run tests
	const results: LiveRun['results'] = [];
	const runner = new ParallelTaskQueue(5);
	const mgr = new AssertionManager(providerManager, storage);
	for (const test of globalTests) {
		const testResults: Writable<LiveResult>[] = [];
		for (const env of envs) {
			const result = writable<LiveResult>({ rawPrompt: null, state: 'waiting' });
			testResults.push(result);
			runner.enqueue(async () => {
				await runTest(test, env, mgr, storage, result);
			});
		}
		results.push(testResults);
	}

	// Create summaries derived from the testResults
	const summaries: LiveRun['summaries'] = runEnvs.map((_, index) =>
		derived(
			results.map((row) => row[index]),
			($results) =>
				summarizeResults($results, (r) => {
					if (r.state === 'success') return true;
					if (r.state === 'error') return false;
					return null;
				})
		)
	);

	// Show the live run immediately
	const run: LiveRun = {
		id: crypto.randomUUID(),
		timestamp: Date.now(),
		description: config.description,
		envs: runEnvs,
		tests: globalTests,
		varNames: getVarNamesForTests(globalTests),
		results,
		summaries
	};
	liveRunStore.update((state) => ({
		...state,
		[run.id]: { run, abort: () => runner.abort() }
	}));
	const originalSelectedRunId = get(selectedRunIdStore);
	selectedRunIdStore.set(run.id);

	try {
		// Wait to finish
		await runner.completed();
	} catch (err) {
		// Run was aborted
		console.warn('Run was aborted:', err);
		selectedRunIdStore.set(originalSelectedRunId);
		return;
	} finally {
		// Clean up and save the run
		mgr.destroy();
		liveRunStore.update((state) => {
			const newState = { ...state };
			delete newState[run.id];
			return newState;
		});
	}

	runStore.update((runs) => ({
		...runs,
		[run.id]: liveRunToRun(run)
	}));

	// Save the run to storage
	storage.addRun(liveRunToRun(run));

	if (document.visibilityState !== 'visible' && Notification.permission === 'granted') {
		new Notification('Eval complete', { body: 'See your results in Evals.' });
	}
}

type RunEnv = { provider: NormalizedProvider; prompt: Prompt };
function getRunEnvs(providers: NormalizedProvider[], prompts: Prompt[]): RunEnv[] {
	const envs: RunEnv[] = [];
	for (const provider of providers) {
		// First use any provider-specific prompts; otherwise, use the global prompts
		const providerPrompts: Prompt[] = provider.prompts ? provider.prompts : prompts;
		for (const prompt of providerPrompts) {
			envs.push({ provider, prompt });
		}
	}
	return envs;
}

function createEnvironments(
	runEnvs: RunEnv[],
	providerManager: ProviderManager
): TestEnvironment[] {
	const envs: TestEnvironment[] = [];
	for (const env of runEnvs) {
		const { provider, prompt } = env;

		const model = providerManager.getProvider(provider.id, provider.config);
		envs.push(
			new SimpleEnvironment({
				model,
				prompt: new HandlebarsPromptFormatter(prompt)
			})
		);
	}
	return envs;
}

async function runTest(
	test: NormalizedTestCase,
	env: TestEnvironment,
	assertionManager: AssertionManager,
	storage: FileLoader,
	result: Writable<LiveResult>
): Promise<void> {
	result.update((state) => ({
		...state,
		state: 'in-progress'
	}));
	// TODO should this be safeRun if it will catch all errors?
	const populatedVars = await populate(test.vars, storage);
	const output = await env.run(populatedVars);

	if (output.error) {
		result.update((state) => ({
			...state,
			...output,
			state: 'error',
			pass: false
		}));
		return;
	}

	// Test assertions
	const assertions = test.assert.map((a) => assertionManager.getAssertion(a, test.vars));
	const assertionResults: AssertionResult[] = [];
	for (const assertion of assertions) {
		const result = await assertion.run(output.output!);
		assertionResults.push(result);
	}
	result.update((state) => ({
		...state,
		...output,
		state: assertionResults.every((r) => r.pass) ? 'success' : 'error',
		assertionResults
	}));
}

function liveRunToRun(liveRun: LiveRun): Run {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { varNames: _varNames, summaries: _summaries, ...rest } = liveRun;
	return {
		...rest,
		version: 1,
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

// FIXME need to iterate through arrays and nested objects
async function populate(vars: VarSet, loader: FileLoader): Promise<PopulatedVarSet> {
	const populated: PopulatedVarSet = {};
	for (const key in vars) {
		if (
			typeof vars[key] === 'string' &&
			vars[key].startsWith('file:///') &&
			isSupportedImageType(vars[key])
		) {
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
