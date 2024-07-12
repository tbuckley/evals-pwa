import {
	promptSchema,
	runSchema,
	testCaseSchema,
	type Prompt,
	type Run,
	type StorageProvider,
	type TestCase
} from '$lib/types';
import type { ZodSchema } from 'zod';

export class FileSystemStorage implements StorageProvider {
	constructor(public dir: FileSystemDirectoryHandle) {}

	async getAllPrompts(): Promise<Prompt[]> {
		const dir = await this.dir.getDirectoryHandle('prompts', { create: true });
		return loadJsonFromDirectoryWithSchema(dir, promptSchema);
	}
	async getAllTestCases(): Promise<TestCase[]> {
		const dir = await this.dir.getDirectoryHandle('tests', { create: true });
		return loadJsonFromDirectoryWithSchema(dir, testCaseSchema);
	}
	async getAllRuns(): Promise<Run[]> {
		const dir = await this.dir.getDirectoryHandle('runs', { create: true });
		return loadJsonFromDirectoryWithSchema(dir, runSchema);
	}
	async getBlob(path: string): Promise<Blob> {
		let dir: FileSystemDirectoryHandle;
		try {
			dir = await this.dir.getDirectoryHandle('files', { create: false });
		} catch (e) {
			if (e instanceof DOMException && e.name === 'NotFoundError') {
				throw new Error(`Folder not found: files/. Expected it to contain file '${path}'`);
			}
			throw e;
		}

		let handle: FileSystemFileHandle;
		try {
			handle = await dir.getFileHandle(path, { create: false });
		} catch (e) {
			if (e instanceof DOMException && e.name === 'NotFoundError') {
				throw new Error(`File not found: ${path}`);
			}
			throw e;
		}

		const file = await handle.getFile();
		return file; // File is a blob
	}

	async addRun(run: Run): Promise<void> {
		const dir = await this.dir.getDirectoryHandle('runs', { create: true });
		// TODO also add a uuid to guarantee uniqueness
		// TODO format as datetime string
		const handle = await dir.getFileHandle(`${run.timestamp}.json`, { create: true });
		const writable = await handle.createWritable();
		writable.write(JSON.stringify(run));

		throw new Error('Method not implemented.');
	}
	reload(): Promise<void> {
		// Do nothing, prompts are always fetched from disk
		return Promise.resolve();
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
