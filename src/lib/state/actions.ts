// import { GeminiProvider } from '$lib/providers/gemini';
// import type { ModelProvider, Prompt, StorageProvider, TestCase, Var } from '$lib/types';

import { get } from 'svelte/store';
import { promptStore, runStore, storageStore, testStore } from './stores';

export async function loadStateFromStorage(): Promise<void> {
	const storage = get(storageStore);
	if (!storage) return;

	const [prompts, tests, runs] = await Promise.all([
		storage.getAllPrompts(),
		storage.getAllTestCases(),
		storage.getAllRuns()
	]);

	// If the storage has changed since the request was made, ignore the results
	if (get(storageStore) !== storage) return;

	promptStore.set(prompts);
	testStore.set(tests);
	runStore.set(runs);
}

// class ModelManager {
// 	get(provider: string, model: string): ModelProvider {
// 		if (provider === 'gemini') {
// 			return new GeminiProvider(model, ''); // TODO API Key
// 		}
// 		throw new Error(`Unknown provider: ${provider}`);
// 	}
// }

// export async function runTest(prompt: Prompt, test: TestCase) {
// 	const modelManager = new ModelManager();
// 	const model = await modelManager.get(prompt.provider, prompt.model);

// 	// Render the prompt
// 	const vars = { ...prompt.defaultVars, ...test.vars };
// 	const preparedVars = await prepareVars(vars);

// 	const response = await model.run(prompt.prompt);
// 	const output = model.extractOutput(response);
// 	return output === test.vars.output;
// }

// async function prepareVars(
// 	storage: StorageProvider,
// 	...vars: Record<string, Var>[]
// ): Promise<Record<string, string>> {
// 	const merged: Record<string, Var> = Object.assign({}, ...vars);

// 	// Find any of type=image and load the image
// 	const imageVars = Object.entries(merged).filter(([key, value]) => {
// 		return typeof value === 'object' && value.type === 'image';
// 	});
// }
