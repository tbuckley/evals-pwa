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

    // Remove backslashes from path before these picomatch special characters: $^*+?()[]
    const picomatchSpecialChars = /\\([\^$()*?[\]])/g;
    const escapedPath = path.replace(picomatchSpecialChars, '$1');
    return this.loadFile(pathToFileUri(escapedPath));
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

  appendFile(uri: string, data: string | Blob): Promise<void> {
    const path = fileUriToPath(uri);
    const filename = getFilename(path);
    if (!filename) {
      throw new Error(`Cannot append to file: ${uri}`);
    }

    const existingFile = this.files.get(path);
    if (!existingFile) {
      // Just create the file
      return this.writeFile(uri, data);
    }

    const file = new File([existingFile, data], filename);
    this.files.set(path, file);
    return Promise.resolve();
  }

  isDirectory(uri: string): Promise<boolean> {
    const path = fileUriToPath(uri);
    // In-memory storage represents directories as keys ending with a slash
    const dirPath = path.endsWith('/') ? path : `${path}/`;
    for (const key of this.files.keys()) {
      if (key.startsWith(dirPath)) {
        return Promise.resolve(true);
      }
    }
    return Promise.resolve(this.files.has(dirPath));
  }
}
