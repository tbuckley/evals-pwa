import {
	runSchema,
	UiError,
	type NormalizedConfig,
	type Run,
	type StorageProvider
} from '$lib/types';
import { dereferenceFilePaths } from './dereferenceFilePaths';
import { FileReference } from './FileReference';
import { normalizeConfig } from './normalizeConfig';
import { fsConfigSchema } from './types';
import { MissingFileError, type WebFileSystemStorage } from './WebFileSystemStorage';
import * as yaml from 'yaml';

export class FileSystemEvalsStorage implements StorageProvider {
	constructor(private fs: WebFileSystemStorage) {}

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
		let raw;
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

		let dereferenced;
		try {
			dereferenced = await dereferenceFilePaths(raw, { storage: this.fs });
		} catch (err) {
			if (err instanceof MissingFileError) {
				throw new UiError({ type: 'missing-config-reference', path: err.path });
			}
			throw err;
		}

		const parsed = fsConfigSchema.safeParse(dereferenced);
		if (!parsed.success) {
			const errors = parsed.error.issues.map(
				(issue) => `${issue.path.join('.')}: ${issue.message}`
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
				const json = JSON.parse(text);
				const dereferenced = await dereferenceFilePaths(json, { storage: this.fs });
				return runSchema.parse(dereferenced);
			})
		);
	}

	async addRun(run: Run): Promise<void> {
		// TODO switch to yaml?
		// TODO also add a uuid to guarantee uniqueness
		// TODO format as datetime string
		await this.fs.writeText(
			`file:///runs/${run.timestamp}.json`,
			JSON.stringify(run, (_key, value) => {
				if (value instanceof FileReference) {
					return value.path;
				}
				return value;
			})
		);
	}

	loadFile(uri: string): Promise<File> {
		return this.fs.loadFile(uri);
	}
}
