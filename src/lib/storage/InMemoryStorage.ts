import { type FileStorage } from '$lib/types/storage';
import { MissingFileError } from '$lib/types/errors';
import { cast } from '$lib/utils/asserts';
import { fileUriToPath, getFilename, pathToFileUri } from '$lib/utils/path';
import picomatch from 'picomatch';

export class InMemoryStorage implements FileStorage {
  private files = new Map<string, File>();

  getName(): string {
    return 'Temporary';
  }

  loadFile(uri: string): Promise<File> {
    const path = fileUriToPath(uri);
    if (this.files.has(path)) {
      return Promise.resolve(cast(this.files.get(path)));
    }
    throw new MissingFileError(uri);
  }

  async load(uri: string): Promise<File | { uri: string; file: File }[]> {
    const path = fileUriToPath(uri);
    const { isGlob, base: picoBase, glob: picoGlob } = picomatch.scan(path);
    const base = picoBase.endsWith('/') ? picoBase : picoBase + '/';

    if (isGlob) {
      const re = picomatch.makeRe(picoGlob, { windows: false, cwd: '/', dot: true });
      const files: { uri: string; file: File }[] = [];
      for (const [path, file] of this.files.entries()) {
        if (path.startsWith(base) && re.test(path.substring(base.length))) {
          files.push({
            uri: pathToFileUri(path),
            file,
          });
        }
      }
      files.sort((a, b) => a.uri.localeCompare(b.uri));
      return files;
    }

    return this.loadFile(uri);
  }

  writeFile(uri: string, data: string | Blob): Promise<void> {
    const path = fileUriToPath(uri);
    const filename = getFilename(path);
    if (!filename) {
      throw new Error(`Cannot write file to directory: ${uri}`);
    }
    const file = new File([data], filename);
    this.files.set(path, file);
    return Promise.resolve();
  }
}
