import type { FileStorage } from '$lib/types/storage';
import { type ModelCache } from '$lib/types';
import { hashJson } from '$lib/utils/hashJson';
import { joinPath, pathToFileUri } from '$lib/utils/path';

export class FileSystemCache implements ModelCache {
  constructor(public fs: FileStorage) {}

  async get(key: unknown): Promise<unknown> {
    try {
      const fileUri = fileUriFor(await hashJson(key));
      const file = await this.fs.loadFile(fileUri);
      const text = await file.text();
      return JSON.parse(text) as unknown;
    } catch {
      return undefined;
    }
  }

  async set(key: unknown, value: unknown): Promise<void> {
    const fileUri = fileUriFor(await hashJson(key));
    await this.fs.writeFile(fileUri, JSON.stringify(value));
  }
}

function fileUriFor(key: string): string {
  return pathToFileUri(joinPath('/cache/', `./${key}.json`));
}
