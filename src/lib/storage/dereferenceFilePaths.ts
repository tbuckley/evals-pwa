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
import { MissingFileError } from './WebFileSystemStorage';
import * as esbuild from 'esbuild-wasm';

export interface FileStorage {
	load(path: string): Promise<File | { uri: string; file: File }[]>;
}

export interface DereferenceOptions {
	storage: FileStorage;
	absolutePath?: string;
	visited?: Set<string>;
	markGlobs?: boolean;
	ignoreMissing?: boolean;
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
					res.map(async ({ uri, file }) => handleFile(uri, file, options))
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

let esbuildReady: Promise<void> | undefined;
function lazyInitEsbuild() {
	if (!esbuildReady) {
		esbuildReady = new Promise<void>((resolve) => {
			esbuild
				.initialize({
					wasmURL: new URL('../../../node_modules/esbuild-wasm/esbuild.wasm', import.meta.url).href
				})
				.then(resolve);
		});
	}
	return esbuildReady;
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
	} else if (file.name.endsWith('.json')) {
		const text = await file.text();
		const newVisited = new Set([...visited, absoluteFileUri]); // Track file to detect cycles
		return dereferenceFilePaths(JSON.parse(text), {
			...options,
			absolutePath: getDirname(fileUriToPath(absoluteFileUri)),
			visited: newVisited
		});
	} else if (file.name.endsWith('.txt') || file.name.endsWith('.js')) {
		// TODO handle js files (for javascript assertions) independently
		const text = await file.text();
		return text;
	} else if (file.name.endsWith('.ts')) {
		await lazyInitEsbuild();
		const loader: esbuild.Plugin = {
			name: 'file loader',
			setup(build) {
				build.onResolve({ filter: /.*/ }, (args) => {
					const importer = args.importer === '' ? undefined : args.importer;
					const path = new URL(args.path, importer).toString();
					return { path, namespace: 'virtual' };
				});
				build.onLoad({ filter: /.*/, namespace: 'virtual' }, async (args) => {
					const file = await options.storage.load(args.path);
					if (Array.isArray(file)) {
						throw new Error('cant load a glob');
					}
					const contents = await file.text();
					return {
						contents,
						loader: 'ts'
					};
				});
			}
		};
		const result = await esbuild.build({
			plugins: [loader],
			entryPoints: [absoluteFileUri],
			target: 'es2022',
			format: 'esm',
			bundle: true
		});
		if (result.errors.length) {
			throw new Error(result.errors.map((value) => value.text).join('\n'));
		}
		return result.outputFiles![0].text;
	} else if (isSupportedImageType(file.name)) {
		return new FileReference(absoluteFileUri, file);
	}
	return absoluteFileUri;
}

function isSupportedImageType(path: string): boolean {
	return path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.jpeg');
}
