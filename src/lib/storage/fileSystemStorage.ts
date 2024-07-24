import {
	type Run,
	type StorageProvider,
	type Config,
	runSchema,
	configSchema,
	type FileLoader
} from '$lib/types';
import type { ZodSchema } from 'zod';
import * as yaml from 'yaml';

export class FileSystemStorage implements StorageProvider, FileLoader {
	constructor(public dir: FileSystemDirectoryHandle) {}

	getName(): string {
		return this.dir.name;
	}

	async getConfig(): Promise<Config> {
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

		let dir = this.dir;
		for (const part of parts) {
			try {
				dir = await dir.getDirectoryHandle(part, { create: false });
			} catch {
				throw new Error(`Error loading directory: ${part}`);
			}
		}
		let handle: FileSystemFileHandle;
		try {
			handle = await dir.getFileHandle(fileName, { create: false });
		} catch {
			throw new Error(`Error loading file: ${fileName}`);
		}

		const file = await handle.getFile();
		return file;
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
