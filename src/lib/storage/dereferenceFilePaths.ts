import {
	fileUriToPath,
	getDirname,
	isValidFileUri,
	joinPath,
	pathIsRelative,
	pathToFileUri
} from '$lib/utils/path';
import * as yaml from 'yaml';
import { FileReference } from './FileReference';
import { CodeReference } from './CodeReference';
import { MissingFileError, type ReadonlyFileStorage } from '$lib/types';

export interface DereferenceOptions {
	storage: ReadonlyFileStorage;
	absolutePath?: string;
	visited?: Set<string>;
	markGlobs?: boolean;
	ignoreMissing?: boolean;
}

const GLOB_TYPE = Symbol('GLOB_TYPE');

export async function dereferenceFilePaths(
	val: unknown,
	options: DereferenceOptions
): Promise<{ result: unknown; changed: boolean }> {
	const state = { changed: false };
	const result = await dereferenceFilePathsImpl(val, options, state);
	return {
		result,
		changed: state.changed
	};
}

export async function dereferenceFilePathsImpl(
	val: unknown,
	options: DereferenceOptions,
	state: { changed: boolean }
): Promise<unknown> {
	if (typeof val === 'string') {
		if (isValidFileUri(val)) {
			let path = fileUriToPath(val);
			if (pathIsRelative(path)) {
				const base = options.absolutePath ?? '/';
				path = joinPath(base, path);
			}
			const fileUri = pathToFileUri(path);
			if (!isValidFileUri(fileUri)) {
				throw new Error(`Generated invalid file URI: ${fileUri} (from ${val})`);
			}

			let res;
			try {
				res = await options.storage.load(fileUri);
			} catch (err) {
				// Throw missing file errors if ignoreMissing is not set
				if (err instanceof MissingFileError && !options.ignoreMissing) {
					throw err;
				}
				// Otherwise, return the filename
				return val;
			}

			if (Array.isArray(res)) {
				const arr = await Promise.all(
					res.map(async ({ uri, file }) => handleFile(uri, file, options, state))
				);

				// If markGlobs is true, return a special object so we can flatten it later
				return options.markGlobs ? { type: GLOB_TYPE, value: arr } : arr;
			}

			const file = res;
			return handleFile(fileUri, file, options, state);
		}
		return val;
	}
	if (Array.isArray(val)) {
		// Use markGlobs:true so we can flatten the results into the array
		const parts = await Promise.all(
			val.map(async (v) => dereferenceFilePathsImpl(v, { ...options, markGlobs: true }, state))
		);
		const arr: unknown[] = [];
		for (const part of parts) {
			if (
				typeof part === 'object' &&
				part &&
				'type' in part &&
				part.type === GLOB_TYPE &&
				'value' in part &&
				Array.isArray(part.value)
			) {
				arr.push(...part.value);
			} else {
				arr.push(part);
			}
		}
		return arr;
	}
	if (val instanceof FileReference) {
		return val;
	}
	if (typeof val === 'object' && val !== null) {
		const obj: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(val)) {
			obj[key] = await dereferenceFilePathsImpl(value as unknown, options, state);
		}
		return obj;
	}
	return val;
}

async function handleFile(
	absoluteFileUri: string,
	file: File,
	options: DereferenceOptions,
	state: { changed: boolean }
) {
	state.changed = true;
	const visited = options.visited ?? new Set<string>();

	// If we've already seen this file, throw an error
	if (visited.has(absoluteFileUri)) {
		throw new Error(`Cyclic reference detected: ${[...visited, absoluteFileUri].join(' -> ')}`);
	}

	if (file.name.endsWith('.yaml')) {
		const text = await file.text();
		const newVisited = new Set([...visited, absoluteFileUri]); // Track file to detect cycles
		return dereferenceFilePathsImpl(
			yaml.parse(text),
			{
				...options,
				absolutePath: getDirname(fileUriToPath(absoluteFileUri)),
				visited: newVisited
			},
			state
		);
	} else if (file.name.endsWith('.json')) {
		const text = await file.text();
		const newVisited = new Set([...visited, absoluteFileUri]); // Track file to detect cycles
		return dereferenceFilePathsImpl(
			JSON.parse(text),
			{
				...options,
				absolutePath: getDirname(fileUriToPath(absoluteFileUri)),
				visited: newVisited
			},
			state
		);
	} else if (file.name.endsWith('.txt')) {
		return await file.text();
	} else if (file.name.endsWith('.js') || file.name.endsWith('.ts')) {
		return new CodeReference(absoluteFileUri, file, options.storage);
	} else {
		return new FileReference(absoluteFileUri, file);
	}
}
