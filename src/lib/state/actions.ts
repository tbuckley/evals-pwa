import { derived, get, writable, type Writable } from 'svelte/store';
import {
  configStore,
  liveRunStore,
  runStore,
  selectedRunIdStore,
  storageStore,
  configFilesStore,
  selectedConfigFileStore,
} from './stores';
import {
  UiError,
  type AssertionResult,
  type FileStorage,
  type LiveResult,
  type LiveRun,
  type NormalizedProvider,
  type NormalizedTestCase,
  type Prompt,
  type Run,
  type RunContext,
  type TestEnvironment,
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
import * as idb from 'idb-keyval';
import { InMemoryStorage } from '$lib/storage/InMemoryStorage';
import * as CodeSandbox from '$lib/utils/CodeSandbox';

const folder = await idb.get<FileSystemDirectoryHandle>('folder');
if (folder) {
  const permission = await folder.queryPermission({ mode: 'readwrite' });
  if (permission === 'granted') {
    await setStorageDirectory(folder);

    // Remember config, if one was set
    const configName = await idb.get<string>('config');
    const configs = get(configFilesStore);
    if (configName && configs.includes(configName)) {
      selectedConfigFileStore.set(configName);
    }

    await loadStateFromStorage();
  }
}

// Track the selected configuration
selectedConfigFileStore.subscribe((configName) => {
  // Only remember it if we are currently in a folder
  const storage = get(storageStore);
  if (storage instanceof FileSystemEvalsStorage && storage.fs instanceof WebFileSystemStorage) {
    idb.set('config', configName).catch((err: unknown) => {
      console.error('Unable to remember selected config', err);
    });
  }
});

export async function chooseFolder() {
  let dir: FileSystemDirectoryHandle;
  try {
    dir = await window.showDirectoryPicker({
      mode: 'readwrite',
      id: 'evals-pwa', // Remember the last used location
      startIn: 'documents', // Default to the documents folder
    });
  } catch (err) {
    console.error(err);
    return;
  }

  // TODO don't allow the user to select a directory if it is invalid
  await setStorageDirectory(dir);
  await loadStateFromStorage();
}

export async function setStorageDirectory(dir: FileSystemDirectoryHandle) {
  const storage = new WebFileSystemStorage(dir);
  await idb.set('folder', dir);
  await setStorage(storage);
}

export async function setInMemoryConfig(config: string) {
  const storage = new InMemoryStorage();
  await storage.writeFile('file:///config.yaml', config);
  await idb.del('folder');
  await idb.del('config');
  await setStorage(storage);
}

export async function saveInMemoryConfigToFileSystem(config?: string) {
  const $storageStore = get(storageStore);

  let dir: FileSystemDirectoryHandle;
  try {
    dir = await window.showDirectoryPicker({
      mode: 'readwrite',
      id: 'evals-pwa', // Remember the last used location
      startIn: 'documents', // Default to the documents folder
    });
  } catch (err) {
    console.error(err);
    return;
  }

  const storage = new WebFileSystemStorage(dir);
  if (
    $storageStore instanceof FileSystemEvalsStorage &&
    $storageStore.fs instanceof InMemoryStorage
  ) {
    // Copy over all files from in-memory storage to the new location
    const files = (await $storageStore.fs.load('file://./**/*')) as { uri: string; file: File }[];
    for (const { uri, file } of files) {
      console.log('writing', uri);
      await storage.writeFile(uri, file);
    }
  } else {
    await storage.writeFile('file:///config.yaml', config ?? '');
  }

  await idb.set('folder', dir);
  await setStorage(storage);
}

export async function setStorage(fileStorage: FileStorage | null) {
  if (!fileStorage) {
    storageStore.set(null);
    return;
  }

  const evalsStorage = new FileSystemEvalsStorage(fileStorage);
  storageStore.set(evalsStorage);

  const configFiles = await evalsStorage.getConfigNames();
  configFilesStore.set(configFiles);
  selectedConfigFileStore.set(configFiles[0]);
}

export async function loadStateFromStorage() {
  const storage = get(storageStore);
  if (!storage) return;

  const selectedConfigFile = get(selectedConfigFileStore);
  let config, runs;
  try {
    [config, runs] = await Promise.all([
      storage.getConfig(selectedConfigFile),
      storage.getAllRuns(selectedConfigFile),
    ]);
  } catch (err) {
    if (err instanceof UiError) {
      switch (err.detail.type) {
        case 'missing-config':
          await showPrompt({
            title: 'Missing config.yaml',
            description: [`Please create ${err.detail.path} in your selected directory.`],
            cancelText: null,
          });
          break;
        case 'missing-config-reference':
          await showPrompt({
            title: 'Missing file',
            description: [
              `The file ${err.detail.path} referenced from your configuration does not exist.`,
            ],
            cancelText: null,
          });
          break;
        case 'invalid-config':
          await showPrompt({
            title: 'Invalid configuration',
            description: [`The config.yaml file contains errors:`, ...err.detail.errors],
            cancelText: null,
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

  // Assumes that runs are sorted alphabetically
  selectedRunIdStore.set(runs.length > 0 ? runs[runs.length - 1].id : null);

  // TODO check that necessary environment variables are set
}

export async function showPrompt(prompt: Omit<AlertState, 'callback'>): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    alertStore.set({ ...prompt, callback: resolve });
  });
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
  const configFile = get(selectedConfigFileStore);

  // Check if the config is the latest
  const latestConfig = await storage.getConfig(configFile);
  if (!deepEquals(config, latestConfig)) {
    // Prompt the user to update to the latest config
    const res = await showPrompt({
      title: 'Configuration has changed',
      description: [
        'The config.yaml has changed since it was last loaded. Would you like to update to the latest configuration?',
      ],
      confirmText: 'Update',
      cancelText: 'Ignore',
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
    Notification.requestPermission().catch((err: unknown) => {
      console.error('Failed to request notification permission', err);
    });
  }

  // Get global prompts + tests
  const globalPrompts: Prompt[] = config.prompts;
  const globalProviders: NormalizedProvider[] = config.providers;
  let globalTests: NormalizedTestCase[] = config.tests;

  // If any tests are marked as "only", filter them
  if (globalTests.some((test) => test.only)) {
    globalTests = globalTests.filter((test) => test.only);
  }

  // Create the provider manager
  const env = get(parsedEnvStore); // TODO validate that env variables for each provider is set
  const providerManager = new ProviderManager(env);

  // Create environments
  const runEnvs: RunEnv[] = getRunEnvs(globalProviders, globalPrompts);
  const envs: TestEnvironment[] = createEnvironments(runEnvs, providerManager);

  // Run tests
  const abortController = new AbortController();
  const results: LiveRun['results'] = [];
  const runner = new ParallelTaskQueue(5);
  const mgr = new AssertionManager(providerManager, abortController.signal);
  try {
    for (const test of globalTests) {
      const testResults: Writable<LiveResult>[] = [];
      for (const env of envs) {
        const result = writable<LiveResult>({ rawPrompt: null, state: 'waiting' });
        testResults.push(result);
        runner.enqueue(async ({ abortSignal }) => {
          await runTest(test, env, mgr, result, { abortSignal });
        });
      }
      results.push(testResults);
    }
  } finally {
    await CodeSandbox.clear();
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
        }),
    ),
  );

  // Show the live run immediately
  const run: LiveRun = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    description: config.description,
    canceled: false,
    envs: runEnvs,
    tests: globalTests,
    varNames: getVarNamesForTests(globalTests),
    results,
    summaries,
  };
  liveRunStore.update((state) => ({
    ...state,
    [run.id]: {
      run,
      abort: () => {
        runner.abort();
        abortController.abort();
      },
    },
  }));
  selectedRunIdStore.set(run.id);

  try {
    // Wait to finish
    await runner.completed();
  } catch (err) {
    // Run was aborted
    console.warn('Run was aborted:', err);
    run.canceled = true;
  } finally {
    // Clean up and save the run
    mgr.destroy();
    liveRunStore.update((state) => {
      const newState = { ...state };
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete newState[run.id];
      return newState;
    });
  }

  runStore.update((runs) => ({
    ...runs,
    [run.id]: liveRunToRun(run),
  }));

  // Save the run to storage
  await storage.addRun(configFile, liveRunToRun(run));

  if (document.visibilityState !== 'visible' && Notification.permission === 'granted') {
    new Notification('Eval complete', { body: 'See your results in Evals.' });
  }
}

interface RunEnv {
  provider: NormalizedProvider;
  prompt: Prompt;
}
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
  providerManager: ProviderManager,
): TestEnvironment[] {
  const envs: TestEnvironment[] = [];
  for (const env of runEnvs) {
    const { provider, prompt } = env;

    const model = providerManager.getProvider(provider.id, provider.config);
    envs.push(
      new SimpleEnvironment({
        model,
        prompt: new HandlebarsPromptFormatter(prompt),
      }),
    );
  }
  return envs;
}

async function runTest(
  test: NormalizedTestCase,
  env: TestEnvironment,
  assertionManager: AssertionManager,
  result: Writable<LiveResult>,
  context: RunContext,
): Promise<void> {
  result.update((state) => ({
    ...state,
    state: 'in-progress',
  }));
  // TODO should this be safeRun if it will catch all errors?
  const generator = env.run(test.vars, context);
  let next;
  while (!next?.done) {
    next = await generator.next();
    if (!next.done) {
      if (typeof next.value === 'string') {
        const delta = next.value;
        result.update((state) => ({
          ...state,
          state: 'in-progress',
          output: (state.output ?? '') + delta,
        }));
      } else {
        const output = next.value.output;
        result.update((state) => ({
          ...state,
          state: 'in-progress',
          output,
        }));
      }
    }
  }
  const output = next.value;

  if (output.error) {
    result.update((state) => ({
      ...state,
      ...output,
      state: 'error',
      pass: false,
    }));
    return;
  }
  if (!output.output) {
    result.update((state) => ({
      ...state,
      state: 'error',
      error: 'No output',
      pass: false,
    }));
    return;
  }

  // Test assertions
  const assertions = test.assert.map((a) => ({
    id: a.id,
    assert: assertionManager.getAssertion(a, test.vars),
  }));
  const assertionResults: AssertionResult[] = [];
  for (const assertion of assertions) {
    const result = await assertion.assert.run(output.output);
    result.id = assertion.id;
    assertionResults.push(result);
  }
  result.update((state) => ({
    ...state,
    ...output,
    state: assertionResults.every((r) => r.pass) ? 'success' : 'error',
    assertionResults,
  }));
}

function liveRunToRun(liveRun: LiveRun): Run {
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
          assertionResults: res.assertionResults ?? [],
        };
      }),
    ),
  };
}

function deepEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object' || a === null) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b as Record<string, unknown>);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if (!deepEquals((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
      return false;
    }
  }
  return true;
}
