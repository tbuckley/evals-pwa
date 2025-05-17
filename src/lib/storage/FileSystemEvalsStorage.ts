import { runSchema, type NormalizedConfig, type Run, type StorageProvider } from '$lib/types';
import { type FileStorage } from '$lib/types/storage';
import { MissingFileError, UiError } from '$lib/types/errors';
import { dereferenceFilePaths } from './dereferenceFilePaths';
import { FileReference } from './FileReference';
import { runGenerators } from './runGenerators';
import { normalizeConfig } from './normalizeConfig';
import { fsConfigSchema } from './types';
import * as yaml from 'yaml';
import * as CodeSandbox from '$lib/utils/CodeSandbox';
import {
  fileUriToPath,
  getDirname,
  joinPath,
  pathIsAbsolute,
  pathIsRelative,
  pathToFileUri,
} from '$lib/utils/path';

export class FileSystemEvalsStorage implements StorageProvider {
  constructor(public fs: FileStorage) {}

  getName(): string {
    return this.fs.getName();
  }

  async getConfigNames(): Promise<string[]> {
    // Get everything matching config.yaml, evals.yaml, or *.evals.yaml
    const files = await this.fs.load('file:///**/*.{yaml,evals.yaml}');
    const fileNames = (files as { uri: string; file: File }[])
      .map(({ uri }) => {
        const path = fileUriToPath(uri);
        if (!pathIsAbsolute(path)) {
          throw new Error('Absolute paths are required');
        }
        return path.substring(1);
      })
      .filter(
        (name) => name === 'config.yaml' || name === 'evals.yaml' || name.endsWith('.evals.yaml'),
      );

    // Separate the files into categories
    const evalsYaml = fileNames.find((name) => name === 'evals.yaml');
    const configYaml = fileNames.find((name) => name === 'config.yaml');
    const otherEvalsYaml = fileNames
      .filter((name) => name !== 'evals.yaml' && name !== 'config.yaml')
      .sort((a, b) => a.localeCompare(b));

    // Combine the results in the desired order
    return [
      ...(evalsYaml ? [evalsYaml] : []),
      ...(configYaml ? [configYaml] : []),
      ...otherEvalsYaml,
    ];
  }

  async getConfig(name = 'config.yaml'): Promise<NormalizedConfig> {
    let file;
    try {
      file = await this.fs.loadFile(`file:///${name}`);
    } catch {
      throw new UiError({ type: 'missing-config', path: `file:///${name}` });
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
      let changed: boolean;
      const cache = new Map<string, WeakRef<FileReference>>();
      do {
        changed = false;
        try {
          const baseDir = getDirname('/' + name);
          const derefResult = await dereferenceFilePaths(result, {
            storage: this.fs,
            cache,
            absolutePath: baseDir,
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

  async getAllRuns(configName: string): Promise<Run[]> {
    const baseDir = getRunsDir(configName);
    let files;
    try {
      files = (await this.fs.load(baseDir + '*.json')) as { uri: string; file: File }[];
    } catch {
      return [];
    }
    // TODO have file layers always return files in order
    files.sort((a, b) => {
      if (a.file.name < b.file.name) {
        return -1;
      }
      return 1;
    });
    const results = await Promise.allSettled(
      files.map(async ({ file }) => {
        const text = await file.text();
        const json = JSON.parse(text) as unknown;
        // TODO should we still catch MissingFileError here?
        const dereferenced = await dereferenceFilePaths(json, {
          storage: this.fs,
          ignoreMissing: true,
          absolutePath: fileUriToPath(baseDir),
        });
        return runSchema.parse(dereferenced.result);
      }),
    );
    results
      .filter((result) => result.status === 'rejected')
      .forEach((result) => {
        // TODO How to display run errors?
        console.error(result.reason);
      });
    return results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
  }

  async addRun(configName: string, run: Run): Promise<void> {
    const baseDir = getRunsDir(configName);

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
          let filePath = fileUriToPath(file.uri);
          if (pathIsRelative(filePath)) {
            filePath = joinPath(fileUriToPath(baseDir), filePath);
          }
          await this.fs.writeFile(pathToFileUri(filePath), file.file);
        }
      }),
    );

    // Then save the run
    await this.fs.writeFile(`${baseDir}${run.timestamp}.json`, data);
  }

  loadFile(uri: string): Promise<File> {
    return this.fs.loadFile(uri);
  }
}

function getRunsDir(configName: string): string {
  let baseDir = 'file:///runs/';
  if (configName.endsWith('.evals.yaml')) {
    const prefix = configName.slice(0, '.evals.yaml'.length * -1); // Remove '.evals.yaml'
    baseDir += `${prefix}/`;
  }
  return baseDir;
}
