import picomatch from 'picomatch';
import { describe, expect, test } from 'vitest';
import { dereferenceFilePaths } from './dereferenceFilePaths';

class InMemoryFileStorage {
	files: Record<string, string> = {};
	register(path: string, text: string) {
		this.files[path] = text;
	}

	private async getFile(path: string): Promise<File> {
		if (!this.files[path]) {
			throw new Error(`File not found: ${path}`);
		}
		const parts = path.split('/');
		const filename = parts[parts.length - 1];
		return new File([this.files[path]], filename);
	}

	async load(path: string): Promise<File | { path: string; file: File }[]> {
		const { isGlob } = picomatch.scan(path);
		if (isGlob) {
			const globPattern = path; // FIXME delete this
			const re = picomatch.makeRe(path);
			const files: { path: string; file: File }[] = [];
			for (const path of Object.keys(this.files)) {
				if (re.test(path)) {
					files.push({
						path: globPattern, // FIXME should just be `path: path,`
						file: await this.getFile(path)
					});
				}
			}
			return files;
		}

		return this.getFile(path);
	}
}

describe('dereferenceFilePaths', () => {
	test('returns a normal object untouched', async () => {
		const storage = new InMemoryFileStorage();
		const input = { a: 1, b: [2, 3], c: { d: 4 } };
		const ouput = await dereferenceFilePaths(input, { storage });
		expect(ouput).toEqual(input);
	});

	test('inserts text files', async () => {
		const storage = new InMemoryFileStorage();
		storage.register('file:///a.txt', 'hello world!');

		const input = { a: 1, b: 'file:///a.txt' };
		const ouput = await dereferenceFilePaths(input, { storage });
		expect(ouput).toEqual({ a: 1, b: 'hello world!' });
	});

	test('inserts yaml files', async () => {
		const storage = new InMemoryFileStorage();
		storage.register('file:///a.yaml', 'c: 3\nd:\n  - 5\n  - 6\n');

		const input = { a: 1, b: 'file:///a.yaml' };
		const ouput = await dereferenceFilePaths(input, { storage });
		expect(ouput).toEqual({ a: 1, b: { c: 3, d: [5, 6] } });
	});

	test('allows referenced yaml to reference additional files', async () => {
		const storage = new InMemoryFileStorage();
		storage.register('file:///a.yaml', 'c: 3\nd: file:///b.txt');
		storage.register('file:///b.txt', 'hello world!');

		const input = { a: 1, b: 'file:///a.yaml' };
		const ouput = await dereferenceFilePaths(input, { storage });
		expect(ouput).toEqual({ a: 1, b: { c: 3, d: 'hello world!' } });
	});

	test('throws an error on recursive cycles', async () => {
		const storage = new InMemoryFileStorage();
		storage.register('file:///a.yaml', 'b: file:///b.yaml');
		storage.register('file:///b.yaml', 'a: file:///a.yaml');

		const input = { a: 'file:///a.yaml' };
		await expect(dereferenceFilePaths(input, { storage })).rejects.toThrowError();
	});

	test('supports glob references as arrays', async () => {
		const storage = new InMemoryFileStorage();
		storage.register('file:///a.txt', 'a');
		storage.register('file:///b.txt', 'b');

		const input = { values: 'file:///*.txt' };
		const output = await dereferenceFilePaths(input, { storage });
		expect(output).toEqual({ values: ['a', 'b'] });
	});

	test('flattens any glob references within an array', async () => {
		const storage = new InMemoryFileStorage();
		storage.register('file:///a.txt', 'a');
		storage.register('file:///b.txt', 'b');

		const input = { values: ['file:///*.txt', 'c'] };
		const output = await dereferenceFilePaths(input, { storage });
		expect(output).toEqual({ values: ['a', 'b', 'c'] });
	});

	test('leaves image files untouched', async () => {
		const storage = new InMemoryFileStorage();
		storage.register('file:///a.txt', 'a');
		storage.register('file:///b.png', 'b');

		const input = { txt: 'file:///a.txt', img: 'file:///b.png' };
		const output = await dereferenceFilePaths(input, { storage });
		expect(output).toEqual({ txt: 'a', img: 'file:///b.png' });
	});
});