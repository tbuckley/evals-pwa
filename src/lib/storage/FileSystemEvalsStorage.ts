import { runSchema, type NormalizedConfig, type Run, type StorageProvider } from '$lib/types';
import { dereferenceFilePaths } from './dereferenceFilePaths';
import { normalizeConfig } from './normalizeConfig';
import { fsConfigSchema } from './types';
import type { WebFileSystemStorage } from './WebFileSystemStorage';
import * as yaml from 'yaml';

export class FileSystemEvalsStorage implements StorageProvider {
	constructor(private fs: WebFileSystemStorage) {}

	getName(): string {
		return this.fs.getName();
	}

	async getConfig(): Promise<NormalizedConfig> {
		const file = await this.fs.loadFile('file:///config.yaml');
		const text = await file.text();
		const raw = yaml.parse(text);

		const dereferenced = await dereferenceFilePaths(raw, { storage: this.fs });
		const parsed = fsConfigSchema.parse(dereferenced);

		return normalizeConfig(parsed);
	}

	async getAllRuns(): Promise<Run[]> {
		const files = (await this.fs.load('file:///runs/*.json')) as { path: string; file: File }[];
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
