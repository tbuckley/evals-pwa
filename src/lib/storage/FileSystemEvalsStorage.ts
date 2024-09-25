import {
  MissingFileError,
  runSchema,
  UiError,
  type FileStorage,
  type NormalizedConfig,
  type Run,
  type StorageProvider,
} from '$lib/types';
import { dereferenceFilePaths } from './dereferenceFilePaths';
import { FileReference } from './FileReference';
import { runGenerators } from './runGenerators';
import { normalizeConfig } from './normalizeConfig';
import { fsConfigSchema } from './types';
import * as yaml from 'yaml';
import * as CodeSandbox from '$lib/utils/CodeSandbox';

export class FileSystemEvalsStorage implements StorageProvider {
  constructor(public fs: FileStorage) {}

  getName(): string {
    return this.fs.getName();
  }

  async getConfig(): Promise<NormalizedConfig> {
    let file;
    try {
      file = await this.fs.loadFile('file:///config.yaml');
    } catch {
      throw new UiError({ type: 'missing-config', path: 'file:///config.yaml' });
    }

    let text;
    let raw: unknown;
    try {
      text = await file.text();
      raw = yaml.parse(text);
    } catch (err) {
      if (err instanceof yaml.YAMLParseError) {
        if (text && err.linePos) {
          const line = text.split('\n')[err.linePos[0].line - 1];
          const error = `Line ${err.linePos[0].line}: ${line}`;
          throw new UiError({ type: 'invalid-config', errors: [error] });
        }
      }
      throw new UiError({ type: 'invalid-config', errors: ['Invalid YAML'] });
    }

    let result = raw;
    try {
      let changed;
      const cache = new Map<string, WeakRef<FileReference>>();
      do {
        changed = false;
        try {
          const derefResult = await dereferenceFilePaths(result, {
            storage: this.fs,
            cache,
          });
          changed ||= derefResult.changed;
          result = derefResult.result;
        } catch (err) {
          if (err instanceof MissingFileError) {
            throw new UiError({ type: 'missing-config-reference', path: err.path });
          }
          throw err;
        }
        try {
          const genResult = await runGenerators(result);
          result = genResult.result;
          changed ||= genResult.changed;
        } catch (err) {
          const message = 'message' in (err as Error) ? (err as Error).message : String(err);
          throw new UiError({ type: 'invalid-config', errors: [`Error in generator: ${message}`] });
        }
      } while (changed);
    } finally {
      await CodeSandbox.clear();
    }

    const parsed = fsConfigSchema.safeParse(result);
    if (!parsed.success) {
      const errors = parsed.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`,
      );
      throw new UiError({ type: 'invalid-config', errors });
    }

    return normalizeConfig(parsed.data);
  }

  async getAllRuns(): Promise<Run[]> {
    let files;
    try {
      files = (await this.fs.load('file:///runs/*.json')) as { uri: string; file: File }[];
    } catch {
      return [];
    }
    return Promise.all(
      files.map(async ({ file }) => {
        const text = await file.text();
        const json = JSON.parse(text) as unknown;
        // TODO should we still catch MissingFileError here?
        const dereferenced = await dereferenceFilePaths(json, {
          storage: this.fs,
          ignoreMissing: true,
        });
        return runSchema.parse(dereferenced.result);
      }),
    );
  }

  async addRun(run: Run): Promise<void> {
    // TODO switch to yaml?
    // TODO also add a uuid to guarantee uniqueness
    // TODO format as datetime string
    const files: FileReference[] = [];
    const data = JSON.stringify(run, (_key, value) => {
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
          await this.fs.writeFile(file.uri, file.file);
        }
      }),
    );

    // Then save the run
    await this.fs.writeFile(`file:///runs/${run.timestamp}.json`, data);
  }

  loadFile(uri: string): Promise<File> {
    return this.fs.loadFile(uri);
  }
}
