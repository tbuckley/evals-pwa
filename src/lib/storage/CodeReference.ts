import * as esbuild from 'esbuild-wasm';
import { FileReference } from './FileReference';
import type { ReadonlyFileStorage } from '$lib/types/storage';
import * as CodeSandbox from '$lib/utils/CodeSandbox';
import { blobToFileReference } from './dereferenceFilePaths';

let esbuildReady: Promise<void> | undefined;
function lazyInitEsbuild() {
  esbuildReady ??= esbuild.initialize({
    wasmURL: new URL('../../../node_modules/esbuild-wasm/esbuild.wasm', import.meta.url).href,
  });

  return esbuildReady;
}

// TODO: Should this check if there is an execute function, or if we need to wrap it in one?
export async function toCodeReference(code: string | CodeReference): Promise<CodeReference> {
  if (typeof code === 'string') {
    code = `${code}
export default execute;`;
    const file = await blobToFileReference(new Blob([code], { type: 'application/javascript' }));
    return new CodeReference(file.uri, file.file);
  }
  return code;
}

export type Executable = (...args: unknown[]) => Promise<unknown>;
export type ModuleExecutable = (name: string | undefined, ...args: unknown[]) => Promise<unknown>;

type Bundle = { result?: string } & (
  | { readonly mode: 'ts'; readonly storage: ReadonlyFileStorage }
  | { readonly mode: 'js' }
);

export class CodeReference extends FileReference {
  readonly #bundle: Bundle;
  #execute?: Executable;

  constructor(uri: string, file: File, storage?: ReadonlyFileStorage) {
    super(uri, file, 'code');
    if (file.name.endsWith('.ts')) {
      if (!storage) {
        throw new Error('storage required for ts');
      }
      this.#bundle = {
        mode: 'ts',
        storage,
      };
    } else {
      this.#bundle = {
        mode: 'js',
      };
    }
  }
  async bind(): Promise<Executable> {
    if (!this.#execute) {
      this.#execute = CodeSandbox.bind(await this.getCode());
    }
    return this.#execute;
  }
  async bindModule(): Promise<ModuleExecutable> {
    return CodeSandbox.bindModule(await this.getCode());
  }
  async getCode() {
    if (this.#bundle.result) return this.#bundle.result;
    if (this.#bundle.mode === 'ts') {
      await lazyInitEsbuild();
      const storage = this.#bundle.storage;
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
            const file = await storage.loadFile(args.path);
            const contents = await file.text();
            return {
              contents,
              loader: 'ts',
            };
          });
        },
      };
      const result = await esbuild.build({
        plugins: [loader],
        entryPoints: [this.uri],
        target: 'es2022',
        format: 'esm',
        bundle: true,
      });
      if (result.errors.length) {
        throw new Error(result.errors.map((value) => value.text).join('\n'));
      }
      if (!result.outputFiles) {
        throw new Error("esbuild didn't produce output");
      }
      return (this.#bundle.result = result.outputFiles[0].text);
    } else {
      return (this.#bundle.result = `${await this.file.text()}

export {execute};`);
    }
  }
}
