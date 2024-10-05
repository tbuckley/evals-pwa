import {
  fileUriToPath,
  getDirname,
  isValidFileUri,
  joinPath,
  pathIsRelative,
  pathToFileUri,
} from '$lib/utils/path';
import * as yaml from 'yaml';
import { FileReference } from './FileReference';
import { CodeReference } from './CodeReference';
import { MissingFileError, type ReadonlyFileStorage } from '$lib/types';

export interface DereferenceOptions {
  storage: ReadonlyFileStorage;
  cache?: Cache;
  absolutePath?: string;
  visited?: Set<string>;
  markGlobs?: boolean;
  ignoreMissing?: boolean;
}
export type Cache = Map<string, WeakRef<FileReference>>;

const GLOB_TYPE = Symbol('GLOB_TYPE');

export async function dereferenceFilePaths(
  val: unknown,
  options: DereferenceOptions,
): Promise<{ result: unknown; changed: boolean }> {
  const state = { changed: false };
  const result = await dereferenceFilePathsImpl(val, options, state);
  return {
    result,
    changed: state.changed,
  };
}

export async function dereferenceFilePathsImpl(
  val: unknown,
  options: DereferenceOptions,
  state: { changed: boolean },
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
          res.map(async ({ uri, file }) => handleFile(uri, file, options, state)),
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
      val.map(async (v) => dereferenceFilePathsImpl(v, { ...options, markGlobs: true }, state)),
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
        arr.push(...(part.value as unknown[]));
      } else {
        arr.push(part);
      }
    }
    return arr;
  }
  if (val instanceof FileReference) {
    return val;
  }
  if (val instanceof Blob) {
    return handleBlob(val, options, state);
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
  state: { changed: boolean },
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
        visited: newVisited,
      },
      state,
    );
  } else if (file.name.endsWith('.json')) {
    const text = await file.text();
    const newVisited = new Set([...visited, absoluteFileUri]); // Track file to detect cycles
    return dereferenceFilePathsImpl(
      JSON.parse(text),
      {
        ...options,
        absolutePath: getDirname(fileUriToPath(absoluteFileUri)),
        visited: newVisited,
      },
      state,
    );
  } else if (file.name.endsWith('.txt')) {
    return await file.text();
  } else if (file.name.endsWith('.js') || file.name.endsWith('.ts')) {
    const ref =
      options.cache?.get(absoluteFileUri)?.deref() ??
      new CodeReference(absoluteFileUri, file, options.storage);
    options.cache?.set(absoluteFileUri, new WeakRef(ref));
    return ref;
  } else {
    const ref =
      options.cache?.get(absoluteFileUri)?.deref() ?? new FileReference(absoluteFileUri, file);
    options.cache?.set(absoluteFileUri, new WeakRef(ref));
    return ref;
  }
}

async function handleBlob(
  blob: Blob | File,
  options: DereferenceOptions,
  state: { changed: boolean },
) {
  const hash = await hashBlob(blob);
  const ext = getFileExtension(blob);
  const filename = hash + ext;
  const file = new File([blob], filename, { type: blob.type });
  // Use relative path, in case it needs to be saved
  return handleFile('file://./' + filename, file, options, state);
}

/**
 * Converts a blob to a FileReference, but does *not* recursively expand
 * .yaml or .json, or return a .txt file as a string.
 */
export async function blobToFileReference(blob: Blob | File) {
  const hash = await hashBlob(blob);
  const ext = getFileExtension(blob);
  const filename = hash + ext;
  const file = new File([blob], filename, { type: blob.type });
  // Use relative path, in case it needs to be saved
  return new FileReference('file://./' + filename, file);
}

async function hashBlob(blob: Blob): Promise<string> {
  const fileReader = new FileReader();
  fileReader.readAsArrayBuffer(blob);

  return new Promise((resolve, reject) => {
    fileReader.onloadend = async () => {
      try {
        const hashBuffer = await crypto.subtle.digest('SHA-256', fileReader.result as ArrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
        resolve(hashHex);
      } catch (err) {
        if (err instanceof Error) {
          reject(err);
        } else {
          reject(new Error('Unknown error', { cause: err }));
        }
      }
    };
  });
}

function getFileExtension(blob: Blob): string {
  if (blob instanceof File) {
    return /[^.]*?$/.exec(blob.name)?.[0] ?? '';
  }
  const extensionMap: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'application/json': '.json',
    'application/x-yaml': '.yaml',
    'application/typescript': '.ts',
    'application/javascript': '.js',
    'text/plain': '.txt',
  };

  if (blob.type in extensionMap) {
    return extensionMap[blob.type];
  }
  return '';
}
