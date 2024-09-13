import type { TestCase } from '$lib/types';
import { CodeSandbox } from '$lib/utils/CodeSandbox';
import { parseCSV } from '$lib/utils/csv';
import { getFileExtension } from '$lib/utils/path';
import type { CodeReference } from './CodeReference';
import { FileReference } from './FileReference';

interface Generator {
	'=gen': string | CodeReference;
	args?: unknown[];
}

function isGenerator(target: unknown): target is Generator {
	return typeof target === 'object' && target != null && '=gen' in target;
}

function hasKey(target: unknown, key: string): target is { [K in string]: unknown } {
	return typeof target === 'object' && target !== null && key in target;
}

function ensureArray<T>(value: T | T[] | null | undefined): T[] {
	if (value == null) return [];
	return Array.isArray(value) ? value : [value];
}

export async function runGenerators(target: any) {
	if (target == null) return target;
	if (typeof target !== 'object') {
		return target;
	}
	if (Array.isArray(target)) {
		for (let i = 0; i < target.length; i++) {
			const value = target[i];
			const result = await runGenerators(value);
			if (isGenerator(value) || hasKey(value, '=gen-tests')) {
				// Flatten generated arrays into arrays.
				const results = ensureArray(result);
				target.splice(i, 1, ...results);
				i += results.length - 1;
			} else {
				target[i] = result;
			}
		}
		return target;
	}
	if (isGenerator(target)) {
		const ref = target['=gen'];
		const sandbox = new CodeSandbox(ref);
		try {
			const args = ensureArray(target['args']);
			return await sandbox.execute(...args);
		} finally {
			sandbox.destroy();
		}
	}

	// Check for built-in generators
	if (hasKey(target, '=gen-tests')) {
		return generateTests(target['=gen-tests']);
	}

	for (const [key, value] of Object.entries(target)) {
		target[key] = await runGenerators(value);
		// Spread operator spreads objects or arrays of objects into the target.
		if (key === '...') {
			for (const props of Array.isArray(target[key]) ? target[key] : [target[key]]) {
				Object.assign(target, props);
			}
			delete target[key];
		}
	}
	return target;
}

async function generateTests(value: unknown): Promise<TestCase[]> {
	if (value instanceof FileReference && getFileExtension(value.uri) === 'csv') {
		const csv = await value.file.text();
		const data = parseCSV(csv);

		return data.map((row) => {
			return {
				vars: row
			};
		});
	}

	throw new Error('Unsupported value for =gen-tests');
}
