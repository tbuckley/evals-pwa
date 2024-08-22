import { describe, expect, test } from 'vitest';
import {
	fileUriToPath,
	getDirname,
	getFilename,
	isValidFileUri,
	joinPath,
	normalizePath,
	pathIsAbsolute,
	pathIsDirectory,
	pathIsFile,
	pathIsRelative
} from './path';

describe('path utils', () => {
	test('detects valid & invalid file URIs', () => {
		// Absolute
		expect(isValidFileUri('file:///path/to/file.txt')).toBe(true);
		expect(isValidFileUri('file:///path/to/dir/')).toBe(true);

		// Relative
		expect(isValidFileUri('file://./path/to/file.txt')).toBe(true);
		expect(isValidFileUri('file://./bar/')).toBe(true);
		expect(isValidFileUri('file://../bar/')).toBe(true);

		// Invalid
		expect(isValidFileUri('file://foo')).toBe(false);
		// expect(isValidFileUri('file://.')).toBe(false); // new URL() will add a trailing slash
	});
	test('supports absolute paths to files', () => {
		expect(fileUriToPath('file:///path/to/file.txt')).toEqual('/path/to/file.txt');
		expect(fileUriToPath('file:///file.txt')).toEqual('/file.txt');
		expect(fileUriToPath('file:///path/to/file')).toEqual('/path/to/file');
	});
	test('supports absolute paths to folders', () => {
		expect(fileUriToPath('file:///path/to/')).toEqual('/path/to/');
		expect(fileUriToPath('file:///bar/')).toEqual('/bar/');
		expect(fileUriToPath('file:///')).toEqual('/');
		expect(fileUriToPath('file://')).toEqual('/');
	});
	test('supports relative paths', () => {
		expect(fileUriToPath('file://./path/to/file.txt')).toEqual('./path/to/file.txt');
		expect(fileUriToPath('file://./bar/')).toEqual('./bar/');
		expect(fileUriToPath('file://./')).toEqual('./');
	});
	test('throws errors on invalid paths', () => {
		expect(() => fileUriToPath('file://path/to/file')).toThrow();
	});
	test('can detect relative and absolute paths', () => {
		expect(pathIsRelative('./path/to/file.txt')).toBe(true);
		expect(pathIsRelative('/path/to/file.txt')).toBe(false);
		expect(pathIsAbsolute('./path/to/file.txt')).toBe(false);
		expect(pathIsAbsolute('/path/to/file.txt')).toBe(true);
	});
	test('can detect directories & files', () => {
		expect(pathIsDirectory('./path/to/file.txt')).toBe(false);
		expect(pathIsDirectory('/path/to/')).toBe(true);
		expect(pathIsFile('/path/to/file.txt')).toBe(true);
		expect(pathIsFile('/path/to/')).toBe(false);
	});
	test('can get the filename', () => {
		expect(getFilename('/path/to/file.txt')).toBe('file.txt');
		expect(getFilename('/path/to/')).toBe(null);
		expect(getFilename('./path/to/file.txt')).toBe('file.txt');
		expect(getFilename('/path/to/file')).toBe('file');
	});
	test('can get the directory name', () => {
		expect(getDirname('./path/to/file.txt')).toBe('./path/to/');
		expect(getDirname('/path/to/')).toBe('/path/to/');
		expect(getDirname('/path/to/file')).toBe('/path/to/');
		expect(getDirname('/path')).toBe('/');
		expect(getDirname('/')).toBe('/');
	});
	test('can normalize a path', () => {
		expect(normalizePath('/path/to/file.txt')).toBe('/path/to/file.txt');
		expect(normalizePath('/path/to/dir/')).toBe('/path/to/dir/');

		// Double slashes
		expect(normalizePath('/path//to//file.txt')).toBe('/path/to/file.txt');
		expect(normalizePath('/path//to//dir/')).toBe('/path/to/dir/');

		// Dots
		expect(normalizePath('/path/./to/./file.txt')).toBe('/path/to/file.txt');
		expect(normalizePath('/./path/./to/././dir/')).toBe('/path/to/dir/');

		// Double dots
		expect(normalizePath('/path/../to/../file.txt')).toBe('/file.txt');
		expect(normalizePath('/path/to/../../file.txt')).toBe('/file.txt');
		expect(() => normalizePath('/../path/to/dir/')).toThrowError();
	});
	test('can join paths', () => {
		expect(joinPath('/path/', './to/', './file.txt')).toBe('/path/to/file.txt');
	});
});
