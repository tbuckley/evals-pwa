export function fileUriToPath(uri: string): string {
	const url = new URL(uri);
	if (url.protocol !== 'file:' || (url.host !== '' && url.host !== '.' && url.host !== '..')) {
		throw new Error(`Invalid file URI: ${uri}`);
	}
	const path = url.host + url.pathname;
	if (pathIsDirectory(path)) {
		return path;
	}

	const filename = getFilename(path);
	if (filename === null || filename === '') {
		throw new Error(`Invalid file URI: ${uri}`);
	}
	if (filename === '.' || filename === '..') {
		throw new Error(`Invalid file URI, must end with a slash: ${uri}`);
	}
	return path;
}

export function isValidFileUri(uri: string): boolean {
	try {
		fileUriToPath(uri);
		return true;
	} catch {
		return false;
	}
}

export function pathIsRelative(path: string): boolean {
	return path.startsWith('./') || path.startsWith('../');
}
export function pathIsAbsolute(path: string): boolean {
	return !pathIsRelative(path);
}

export function pathIsDirectory(path: string): boolean {
	return path.endsWith('/');
}
export function pathIsFile(path: string): boolean {
	return !pathIsDirectory(path);
}

export function getFilename(path: string): string | null {
	if (!pathIsFile(path)) {
		return null;
	}
	return path.split('/').pop()!;
}
export function getDirname(path: string): string {
	return pathIsDirectory(path) ? path : path.split('/').slice(0, -1).join('/') + '/';
}

export function normalizePath(path: string): string {
	if (!pathIsAbsolute(path)) {
		throw new Error(`Path is not absolute: ${path}`);
	}

	// Handle dot and empty parts (no effect), double-dot (go up)
	const dirname = getDirname(path);
	const parts = dirname.substring(1, dirname.length - 1).split('/');
	const newParts = [];
	for (const part of parts) {
		if (part === '..') {
			if (newParts.length === 0) {
				throw new Error('Cannot go above root');
			}
			newParts.pop();
		} else if (part !== '.' && part !== '') {
			newParts.push(part);
		}
	}

	const dir = newParts.length > 0 ? '/' + newParts.join('/') + '/' : '/';
	const filename = getFilename(path);
	if (filename) {
		return dir + filename;
	}
	return dir;
}

export function joinPath(...paths: string[]): string {
	// Ensure all but last path are directories
	if (paths.slice(0, -1).some((path) => pathIsFile(path))) {
		throw new Error(`All but the last path must be directories: ${paths}`);
	}

	// Ensure first part is absolute
	if (!pathIsAbsolute(paths[0])) {
		throw new Error(`First path must be absolute: ${paths}`);
	}

	// Ensure all following parts are relative
	if (paths.slice(1).some((path) => pathIsAbsolute(path))) {
		throw new Error(`All but the first path must be relative: ${paths}`);
	}

	return normalizePath(paths.join(''));
}

// export function join(...paths: string[]): string {
// 	return paths.join('/');
// }
