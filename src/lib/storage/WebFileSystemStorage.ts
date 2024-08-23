import {
	fileUriToPath,
	getDirname,
	getFilename,
	joinPath,
	normalizePath,
	pathIsAbsolute,
	pathIsDirectory,
	pathIsFile,
	pathToFileUri
} from '$lib/utils/path';
import picomatch from 'picomatch';

export class WebFileSystemStorage {
	constructor(public dir: FileSystemDirectoryHandle) {}

	getName(): string {
		return this.dir.name;
	}

	async load(uri: string): Promise<File | { uri: string; file: File }[]> {
		const path = fileUriToPath(uri);

		const { base: picoDirname, glob, isGlob } = picomatch.scan(path);
		if (!isGlob) {
			return this.loadFile(uri);
		}
		const base = picoDirname + '/';
		if (!pathIsAbsolute(base) || !pathIsDirectory(base)) {
			throw new Error(`Invalid glob base: ${base}`);
		}

		const re = picomatch.makeRe(glob, { windows: false, cwd: '/' });
		const basedir = await this.getSubdirHandle(base);

		const files: { uri: string; file: File }[] = [];
		await fileDfs(basedir, async (filepath, handle) => {
			if (re.test(filepath)) {
				files.push({
					uri: pathToFileUri(joinPath(base, './' + filepath)),
					file: await handle.getFile()
				});
			}
		});
		return files;
	}

	async writeText(uri: string, text: string): Promise<void> {
		const filepath = fileUriToPath(uri);
		if (!pathIsFile(filepath)) {
			throw new Error(`Cannot write to a directory: ${uri}`);
		}
		const dirname = getDirname(filepath);
		const filename = getFilename(filepath)!;

		const dir = await this.getSubdirHandle(dirname, true);
		const handle = await dir.getFileHandle(filename, { create: true });

		const writable = await handle.createWritable();
		await writable.write(text);
		await writable.close();
	}

	async loadFile(uri: string): Promise<File> {
		const filepath = fileUriToPath(uri);
		if (!pathIsFile(filepath)) {
			throw new Error(`Cannot write to a directory: ${uri}`);
		}
		const dirname = getDirname(filepath);
		const filename = getFilename(filepath)!;

		const dir = await this.getSubdirHandle(dirname);
		const handle = await handleNotFoundError(dir.getFileHandle(filename, { create: false }), uri);
		return handle.getFile();
	}

	private async getSubdirHandle(path: string, create = false): Promise<FileSystemDirectoryHandle> {
		if (path === '') {
			return this.dir;
		}
		const parts = getAbsPathDirectories(path); // Should not contain a trailing slash, unless the path itself ends with one
		let subdir = this.dir;
		for (const part of parts) {
			subdir = await handleNotFoundError(subdir.getDirectoryHandle(part, { create }), path);
		}
		return subdir;
	}
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

// Note: must return relative paths without ./, so that the glob matching works
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

function getAbsPathDirectories(path: string): string[] {
	if (!pathIsAbsolute(path)) {
		throw new Error(`Path is not absolute: ${path}`);
	}
	if (!pathIsDirectory(path)) {
		throw new Error(`Path is not a directory: ${path}`);
	}

	const normalized = normalizePath(path);
	const parts = normalized.split('/');

	// For absolute paths to directories, the first and last parts should be empty
	if (parts[0] !== '') {
		throw new Error(`Path is not absolute: ${path}`);
	}
	if (parts[parts.length - 1] !== '') {
		throw new Error(`Path is not a directory: ${path}`);
	}
	return parts.slice(1, -1);
}

export class MissingFileError extends Error {
	constructor(public path: string) {
		super(`File not found: ${path}`);
	}
}
