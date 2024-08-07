import picomatch from 'picomatch';

export class WebFileSystemStorage {
	constructor(public dir: FileSystemDirectoryHandle) {}

	getName(): string {
		return this.dir.name;
	}

	async load(uri: string): Promise<File | { path: string; file: File }[]> {
		const path = getPathFromUri(uri);

		const { base, glob, isGlob } = picomatch.scan(path);
		if (!isGlob) {
			return this.loadFile(uri);
		}

		const re = picomatch.makeRe(glob, { windows: false, cwd: '/' });
		const basedir = await this.getSubdirHandle(base);

		const files: { path: string; file: File }[] = [];
		await fileDfs(basedir, async (filepath, handle) => {
			if (re.test(filepath)) {
				files.push({ path: base + '/' + filepath, file: await handle.getFile() });
			}
		});
		return files;
	}

	async writeText(uri: string, text: string): Promise<void> {
		const filepath = getPathFromUri(uri);
		const { path, filename } = splitPathAndFilename(filepath);

		const dir = await this.getSubdirHandle(path);
		const handle = await dir.getFileHandle(filename, { create: true });

		const writable = await handle.createWritable();
		await writable.write(text);
		await writable.close();
	}

	async loadFile(uri: string): Promise<File> {
		const filepath = getPathFromUri(uri);
		const { path, filename } = splitPathAndFilename(filepath);
		const dir = await this.getSubdirHandle(path);
		const handle = await handleNotFoundError(dir.getFileHandle(filename, { create: false }), uri);
		return handle.getFile();
	}

	private async getSubdirHandle(path: string): Promise<FileSystemDirectoryHandle> {
		if (path === '') {
			return this.dir;
		}
		const parts = path.split('/'); // Should not contain a trailing slash, unless the path itself ends with one
		let subdir = this.dir;
		for (const part of parts) {
			// TODO error if part is empty?
			subdir = await handleNotFoundError(subdir.getDirectoryHandle(part, { create: false }), path);
		}
		return subdir;
	}
}

function getPathFromUri(uri: string): string {
	if (!uri.startsWith('file:///')) {
		throw new Error('Invalid path');
	}
	return uri.slice('file:///'.length);
}

function splitPathAndFilename(filepath: string): { path: string; filename: string } {
	const parts = filepath.split('/');
	const filename = parts.pop()!;
	if (!filename) {
		throw new Error('Invalid path');
	}
	const path = parts.join('/');
	return { path, filename };
}
async function handleNotFoundError<T>(handlePromise: Promise<T>, path: string): Promise<T> {
	try {
		return await handlePromise;
	} catch (e) {
		if (e instanceof DOMException && e.name === 'NotFoundError') {
			throw new MissingFileError(path);
		}
		throw e;
	}
}
async function fileDfs(
	dir: FileSystemDirectoryHandle,
	fn: (filepath: string, handle: FileSystemFileHandle) => Promise<void>
): Promise<void> {
	const queue: { path: string; handle: FileSystemDirectoryHandle }[] = [{ handle: dir, path: '' }];
	while (queue.length > 0) {
		const { handle, path } = queue.pop()!;
		for await (const entry of handle.values()) {
			if (entry.kind === 'file') {
				await fn(path + entry.name, entry);
			} else if (entry.kind === 'directory') {
				queue.push({ path: path + entry.name + '/', handle: entry });
			}
		}
	}
}

export class MissingFileError extends Error {
	constructor(public path: string) {
		super(`File not found: ${path}`);
	}
}
