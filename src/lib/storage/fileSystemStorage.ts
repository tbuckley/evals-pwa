import {
	type Run,
	type StorageProvider,
	type Config,
	runSchema,
	configSchema,
	type FileLoader,
	type NormalizedConfig,
	type NormalizedProvider,
	type NormalizedTestCase,
	type NormalizedAssertion,
	type Assertion,
	testCaseSchema,
	type VarSet
} from '$lib/types';
import type { ZodSchema } from 'zod';
import * as yaml from 'yaml';
import * as pm from 'picomatch';

export class FileSystemStorage implements StorageProvider, FileLoader {
	constructor(public dir: FileSystemDirectoryHandle) {}

	getName(): string {
		return this.dir.name;
	}

	private async getRawConfig(): Promise<Config> {
		console.log('getting config...');
		for await (const entry of this.dir.values()) {
			console.log(entry.kind, entry.name);
		}
		const configHandle = await this.dir.getFileHandle('config.yaml', { create: false });
		console.log('got config file');
		const file = await configHandle.getFile();
		const text = await file.text();
		const data = yaml.parse(text);
		const res = configSchema.safeParse(data);
		if (!res.success) {
			console.log(res.error.errors);
			throw new Error('Invalid config file');
		}
		return res.data;
	}

	async getConfig(): Promise<NormalizedConfig> {
		const config = await this.getRawConfig();

		const [providers, tests, prompts] = await Promise.all([
			this.normalizeProviders(config.providers),
			this.normalizeTestCases(config.tests, config.defaultTest),
			this.normalizePrompts(config.prompts)
		]);
		return {
			description: config.description,
			providers,
			prompts,
			tests
		};
	}
	private async normalizePrompts(prompts: Config['prompts']): Promise<string[]> {
		if (!prompts) {
			return [];
		}

		const normalized: string[] = [];
		for (const prompt of prompts) {
			if (isFileRef(prompt, '.txt')) {
				const files = await this.loadGlob(prompt);
				for (const file of files) {
					const text = await file.text();
					normalized.push(text);
				}
			} else {
				normalized.push(prompt);
			}
		}
		return normalized;
	}
	private async normalizeProviders(providers: Config['providers']): Promise<NormalizedProvider[]> {
		if (!providers) {
			return [];
		}

		const normalized: NormalizedProvider[] = [];
		for (const provider of providers) {
			if (typeof provider === 'string') {
				normalized.push({ id: provider });
			} else {
				normalized.push(provider);
			}
		}
		return normalized;
	}
	private async normalizeTestCases(
		tests: Config['tests'],
		defaultTest: Config['defaultTest']
	): Promise<NormalizedTestCase[]> {
		if (!tests) {
			return [];
		}

		const normalized: NormalizedTestCase[] = [];
		for (let test of tests) {
			if (typeof test === 'string') {
				if (isFileRef(test, '.yaml')) {
					const file = await this.loadFile(test);
					const text = await file.text();
					const data = yaml.parse(text);
					test = testCaseSchema.parse(data);
				} else {
					throw new Error('String test case must be a reference to a yaml file');
				}
			}
			const vars: VarSet = await this.normalizeVars({
				...(defaultTest?.vars ?? {}),
				...(test.vars ?? {})
			});
			const assert = await Promise.all(
				[...(defaultTest?.assert ?? []), ...(test.assert ?? [])].map((assert) =>
					this.normalizeAssertion(assert)
				)
			);
			normalized.push({ description: test.description, vars, assert });
		}
		return normalized;
	}
	private async normalizeAssertion(assertion: Assertion): Promise<NormalizedAssertion> {
		const vars = await this.normalizeVars(assertion.vars ?? {});
		return { ...assertion, vars };
	}
	private async normalizeVars<T>(vars: Record<string, T>): Promise<Record<string, T | string>> {
		const normalized: Record<string, T | string> = { ...vars };
		for (const key in normalized) {
			if (typeof normalized[key] === 'string' && isFileRef(normalized[key], '.txt')) {
				const file = await this.loadFile(normalized[key]);
				const text = await file.text();
				normalized[key] = text;
			}
			// TODO also load other file types, or throw an error
			// Currently images are loaded in runTests
		}
		return normalized;
	}

	async getAllRuns(): Promise<Run[]> {
		const dir = await this.dir.getDirectoryHandle('runs', { create: true });
		const runs = await loadJsonFromDirectoryWithSchema(dir, runSchema);
		runs.sort((a, b) => a.timestamp - b.timestamp);
		// If a run has the wrong number of rows/columns, throw an error
		for (const run of runs) {
			if (run.tests.length !== run.results.length) {
				throw new Error(`Run ${run.id} has the wrong number of rows`);
			}
			for (const [i, row] of run.results.entries()) {
				if (row.length !== run.envs.length) {
					throw new Error(`Run ${run.id} has the wrong number of columns in row ${i}`);
				}
			}
		}
		return runs;
	}
	private async getSubdirHandle(path: string): Promise<FileSystemDirectoryHandle> {
		if (path === '') {
			return this.dir;
		}
		const parts = path.split('/'); // Should not contain a trailing slash, unless the path itself ends with one
		let basedir = this.dir;
		for (const part of parts) {
			// TODO error if part is empty?
			try {
				basedir = await basedir.getDirectoryHandle(part, { create: false });
			} catch {
				throw new Error(`Error loading directory: "${part}" (of "${path}")`);
			}
		}
		return basedir;
	}

	async loadFile(path: string): Promise<File> {
		// Ensure that path starts with file:/// and remove it
		if (!path.startsWith('file:///')) {
			throw new Error('Invalid path');
		}
		path = path.slice('file:///'.length);

		const parts = path.split('/');
		const fileName = parts.pop();
		if (!fileName) {
			throw new Error('Invalid path');
		}

		const dir = await this.getSubdirHandle(parts.join('/'));
		let handle: FileSystemFileHandle;
		try {
			handle = await dir.getFileHandle(fileName, { create: false });
		} catch {
			throw new Error(`Error loading file: ${fileName}`);
		}

		const file = await handle.getFile();
		return file;
	}

	async loadGlob(pattern: string): Promise<File[]> {
		// Ensure that pattern starts with file:/// and remove it
		if (!pattern.startsWith('file:///')) {
			throw new Error('Invalid path');
		}
		pattern = pattern.slice('file:///'.length);

		// Split pattern into base + glob
		const { base, glob, isGlob } = pm.scan(pattern);

		// If it's not a glob, just load the file...
		if (!isGlob) {
			const file = await this.loadFile('file:///' + pattern);
			return [file];
		}

		// Get a regular expression. mm.isMatch() will use nodejs path module.
		const re = pm.makeRe(glob, { windows: false, cwd: '/' });

		// Get all file paths
		const files: File[] = [];
		const basedir = await this.getSubdirHandle(base);
		const queue: { handle: FileSystemDirectoryHandle; path: string }[] = [
			{ handle: basedir, path: '' }
		];
		while (queue.length > 0) {
			const { handle, path } = queue.pop()!;
			for await (const entry of handle.values()) {
				if (entry.kind === 'file' && re.test(path + entry.name)) {
					files.push(await entry.getFile());
				} else if (entry.kind === 'directory') {
					queue.push({ handle: entry, path: path + entry.name + '/' });
				}
			}
		}

		return files;
	}

	async addRun(run: Run): Promise<void> {
		const dir = await this.dir.getDirectoryHandle('runs', { create: true });
		// TODO also add a uuid to guarantee uniqueness
		// TODO format as datetime string
		const handle = await dir.getFileHandle(`${run.timestamp}.json`, { create: true });
		const writable = await handle.createWritable();
		await writable.write(JSON.stringify(run));
		await writable.close();
	}
}

async function loadJsonFromDirectoryWithSchema<T>(
	dir: FileSystemDirectoryHandle,
	schema: ZodSchema<T>
): Promise<T[]> {
	const handles = await getAllEntries(dir);
	const jsonFiles = handles.filter(isJsonFile) as FileSystemFileHandle[];
	const jsonObjects = await Promise.all(jsonFiles.map((fh) => getFileJson(fh)));
	return jsonObjects.map((obj) => schema.parse(obj));
}
async function getAllEntries(dir: FileSystemDirectoryHandle): Promise<FileSystemHandle[]> {
	const handles: FileSystemHandle[] = [];
	for await (const entry of dir.values()) {
		handles.push(entry);
	}
	return handles;
}
function isJsonFile(handle: FileSystemHandle): boolean {
	return handle.kind === 'file' && handle.name.endsWith('.json');
}
async function getFileJson(handle: FileSystemFileHandle): Promise<unknown> {
	const file = await handle.getFile();
	const text = await file.text();
	return JSON.parse(text);
}
function isFileRef(value: string, type?: string): boolean {
	if (!value.startsWith('file:///')) {
		return false;
	}
	if (type) {
		return value.endsWith(type);
	}
	return true;
}
