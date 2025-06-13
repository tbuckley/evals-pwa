import { cast } from './asserts';

export function fileUriToPath(uri: string): string {
  if (!uri.startsWith('file://')) {
    throw new Error(`Invalid file URI, must start with "file://": ${uri}`);
  }

  let path = uri.substring('file://'.length);
  if (path === '') {
    path = '/';
  }
  if (!path.startsWith('/') && !path.startsWith('./') && !path.startsWith('../')) {
    throw new Error(`Invalid file URI, path must start with "/", "./", or "../": ${uri}`);
  }

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

export function pathToFileUri(path: string): string {
  // TODO validate path?
  return 'file://' + path;
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
  return path.startsWith('/');
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
  return cast(path.split('/').pop());
}

export function getFileExtension(path: string): string | null {
  const filename = getFilename(path);
  if (!filename) {
    return null;
  }

  // Return the string after the last period
  return filename.split('.').pop() ?? null;
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
    throw new Error(`All but the last path must be directories: ${paths.join(', ')}`);
  }

  // Ensure first part is absolute
  if (!pathIsAbsolute(paths[0])) {
    throw new Error(`First path must be absolute: ${paths.join(', ')}`);
  }

  // Ensure all following parts are relative
  if (paths.slice(1).some((path) => pathIsAbsolute(path))) {
    throw new Error(`All but the first path must be relative: ${paths.join(', ')}`);
  }

  return normalizePath(paths.join(''));
}

// export function join(...paths: string[]): string {
// 	return paths.join('/');
// }
