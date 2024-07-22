import { derived } from 'svelte/store';
import { configStore } from './stores';
import { ProviderManager } from '$lib/providers/ProviderManager';
import { envStore } from './env';

function parseEnvText(env: string): Record<string, string> {
	// Given a series of key=value pairs separated by newlines, create an object
	// Ignore lines starting with #
	const lines = env.split('\n');
	const res: Record<string, string> = {};
	for (const line of lines) {
		if (line.startsWith('#')) {
			continue;
		}
		const index = line.indexOf('=');
		if (index === -1) {
			console.warn(`Invalid line in env: ${line}`);
			continue;
		}
		const key = line.slice(0, index);
		const value = line.slice(index + 1);
		res[key] = value;
	}
	return res;
}

export const parsedEnvStore = derived(envStore, ($env) => {
	return parseEnvText($env);
});

export const requiredEnvStore = derived(configStore, ($config) => {
	const requiredEnvVars = new Set<string>();
	const providers = $config?.providers ?? [];
	const mgr = new ProviderManager({});
	for (const provider of providers) {
		const providerId = typeof provider === 'string' ? provider : provider.id;
		const envVars = mgr.getRequiredEnvVars(providerId);
		for (const envVar of envVars) {
			requiredEnvVars.add(envVar);
		}
	}

	return Array.from(requiredEnvVars).sort();
});

export const validEnvStore = derived([requiredEnvStore, parsedEnvStore], ([$requiredEnv, $env]) => {
	for (const key of $requiredEnv) {
		if (!$env[key]) {
			return false;
		}
	}
	return true;
});
