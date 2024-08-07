import {
	runSchema,
	UiError,
	type NormalizedConfig,
	type Run,
	type StorageProvider
} from '$lib/types';
import { dereferenceFilePaths } from './dereferenceFilePaths';
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

		const text = await file.text();
		const raw = yaml.parse(text);

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
			files = (await this.fs.load('file:///runs/*.json')) as { path: string; file: File }[];
		} catch {
			return [];
		}
		return Promise.all(
			files.map(async ({ file }) => {
				const text = await file.text();
				const json = JSON.parse(text);
				return runSchema.parse(json);
			})
		);
	}

	async addRun(run: Run): Promise<void> {
		// TODO switch to yaml?
		// TODO also add a uuid to guarantee uniqueness
		// TODO format as datetime string
		await this.fs.writeText(`file:///runs/${run.timestamp}.json`, JSON.stringify(run));
	}

	loadFile(uri: string): Promise<File> {
		return this.fs.loadFile(uri);
	}
}
