import type { FileStorage } from '$lib/types/storage';
import { type ModelCache } from '$lib/types';
import { hashJson } from '$lib/utils/hashJson';
import { fileUriToPath, joinPath, pathIsRelative, pathToFileUri } from '$lib/utils/path';
import { FileReference } from './FileReference';
import { dereferenceFilePaths } from './dereferenceFilePaths';

const CACHE_DIR = '/cache/';

export class FileSystemCache implements ModelCache {
  constructor(public fs: FileStorage) {}

  async get(key: unknown): Promise<unknown> {
    try {
      const fileUri = fileUriFor(await hashJson(key));
      const file = await this.fs.loadFile(fileUri);
      const text = await file.text();
      const json = JSON.parse(text) as unknown;

      const dereferenced = await dereferenceFilePaths(json, {
        storage: this.fs,
        ignoreMissing: true,
        absolutePath: CACHE_DIR,
      });
      return dereferenced.result;
    } catch {
      return undefined;
    }
  }

  async set(key: unknown, value: unknown): Promise<void> {
    const fileUri = fileUriFor(await hashJson(key));

    const files: FileReference[] = [];
    const data = JSON.stringify(value, (_key, value) => {
      if (value instanceof FileReference) {
        files.push(value);
        return value.uri;
      }
      return value as unknown;
    });

    // First, make sure all the files exist, or create them
    await Promise.all(
      files.map(async (file) => {
        try {
          await this.fs.loadFile(file.uri);
        } catch {
          let filePath = fileUriToPath(file.uri);
          if (pathIsRelative(filePath)) {
            filePath = joinPath(CACHE_DIR, filePath);
          }
          await this.fs.writeFile(pathToFileUri(filePath), file.file);
        }
      }),
    );

    await this.fs.writeFile(fileUri, data);
  }
}

function fileUriFor(key: string): string {
  return pathToFileUri(joinPath(CACHE_DIR, `./${key}.json`));
}
