import {
	fileUriToPath,
	getDirname,
	isValidFileUri,
	joinPath,
	pathIsRelative
} from '$lib/utils/path';
import * as yaml from 'yaml';

export interface FileStorage {
	load(path: string): Promise<File | { path: string; file: File }[]>;
}

export interface DereferenceOptions {
	storage: FileStorage;
	absolutePath?: string;
	visited?: Set<string>;
	markGlobs?: boolean;
}

const GLOB_TYPE = Symbol('GLOB_TYPE');

export async function dereferenceFilePaths(
	val: unknown,
	options: DereferenceOptions
): Promise<unknown> {
	if (typeof val === 'string') {
		if (isValidFileUri(val)) {
			let path = fileUriToPath(val);
			if (pathIsRelative(path)) {
				const base = options.absolutePath ?? '/';
				path = joinPath(base, path);
			}
			const fileUri = `file://${path}`;

			const res = await options.storage.load(fileUri);
			if (Array.isArray(res)) {
				const arr = await Promise.all(
					res.map(async ({ path, file }) => handleFile(path, file, options))
				);

				// If markGlobs is true, return a special object so we can flatten it later
				return options.markGlobs ? { type: GLOB_TYPE, value: arr } : arr;
			}

			const file = res;
			return handleFile(fileUri, file, options);
		}
		return val;
	}
	if (Array.isArray(val)) {
		// Use markGlobs:true so we can flatten the results into the array
		const parts = await Promise.all(
			val.map(async (v) => dereferenceFilePaths(v, { ...options, markGlobs: true }))
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
	if (typeof val === 'object' && val !== null) {
		const obj: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(val)) {
			obj[key] = await dereferenceFilePaths(value as unknown, options);
		}
		return obj;
	}
	return val;
}

async function handleFile(absoluteFileUri: string, file: File, options: DereferenceOptions) {
	const visited = options.visited ?? new Set<string>();

	// If we've already seen this file, throw an error
	if (visited.has(absoluteFileUri)) {
		throw new Error(`Cyclic reference detected: ${[...visited, absoluteFileUri].join(' -> ')}`);
	}

	if (file.name.endsWith('.yaml')) {
		const text = await file.text();
		const newVisited = new Set([...visited, absoluteFileUri]); // Track file to detect cycles
		return dereferenceFilePaths(yaml.parse(text), {
			...options,
			absolutePath: getDirname(fileUriToPath(absoluteFileUri)),
			visited: newVisited
		});
	} else if (file.name.endsWith('.txt') || file.name.endsWith('.js')) {
		// TODO handle js files (for javascript assertions) independently
		const text = await file.text();
		return text;
	}
	return absoluteFileUri;
}
