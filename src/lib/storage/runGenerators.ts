import { CodeSandbox } from '$lib/utils/CodeSandbox';

interface Generator {
	'=gen': string;
	args?: unknown[];
}

function isGenerator(target: unknown): target is Generator {
	return typeof target === 'object' && target != null && '=gen' in target;
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
			if (isGenerator(value)) {
				// Flatten generated arrays into arrays.
				const results = Array.isArray(result) ? result : [result];
				target.splice(i, 1, ...results);
				i += results.length - 1;
			} else {
				target[i] = result;
			}
		}
		return target;
	}
	if (isGenerator(target)) {
		const sandbox = new CodeSandbox(target['=gen']);
		const args = target['args'] ?? [];
		return await sandbox.execute(...args);
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
