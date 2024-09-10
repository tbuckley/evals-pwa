import { CodeSandbox } from '$lib/utils/CodeSandbox';

export async function runGenerators(target: any) {
	if (target == null) return target;
	if (typeof target !== 'object') {
		return target;
	}
	if (Array.isArray(target)) {
		for (let i = 0; i < target.length; i++) {
			target[i] = await runGenerators(target[i]);
		}
		return target;
	}
	if (Object.keys(target).includes('=gen')) {
		const sandbox = new CodeSandbox(target['=gen']);
		const args = target['args'] ?? [];
		return await sandbox.execute(...args);
	}
	for (const [key, value] of Object.entries(target)) {
		target[key] = await runGenerators(value);
	}
	return target;
}
