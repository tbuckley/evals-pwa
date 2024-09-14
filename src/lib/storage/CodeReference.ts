import * as esbuild from 'esbuild-wasm';
import { FileReference } from './FileReference';
import type { ReadonlyFileStorage } from '$lib/types';

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

export class CodeReference extends FileReference {
	readonly #storage: ReadonlyFileStorage;
	#bundle?: string;

	constructor(uri: string, file: File, storage: ReadonlyFileStorage) {
		super(uri, file, 'code');
		this.#storage = storage;
	}
	async getCode() {
		if (this.file.name.endsWith('.ts')) {
			if (this.#bundle) return this.#bundle;
			await lazyInitEsbuild();
			const storage = this.#storage;
			const loader: esbuild.Plugin = {
				name: 'file loader',
				setup(build) {
					build.onResolve({ filter: /.*/ }, (args) => {
						const importer = args.importer === '' ? undefined : args.importer;
						const ext = args.path.endsWith('.ts') ? '' : '.ts';
						const path = new URL(args.path, importer).toString() + ext;
						return { path, namespace: 'virtual' };
					});
					build.onLoad({ filter: /.*/, namespace: 'virtual' }, async (args) => {
						const file = await storage.load(args.path);
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
				entryPoints: [this.uri],
				target: 'es2022',
				format: 'esm',
				bundle: true
			});
			if (result.errors.length) {
				throw new Error(result.errors.map((value) => value.text).join('\n'));
			}
			return (this.#bundle = result.outputFiles![0].text);
		}
		return await this.file.text();
	}
}
