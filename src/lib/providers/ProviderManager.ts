import type { ModelProvider } from '$lib/types';
import { GeminiProvider } from './gemini';
import { OpenaiProvider } from './openai';
import { ReverserProvider } from './reverser';

export class ProviderManager {
	constructor(public env: Record<string, string>) {}

	getProvider(id: string): ModelProvider {
		// id is in the format providerId:modelName, for example gemini:gemini-1.5-pro-latest
		const index = id.indexOf(':');
		if (index === -1) {
			throw new Error(`Invalid provider id: ${id}`);
		}
		const providerId = id.slice(0, index);
		const modelName = id.slice(index + 1);

		if (providerId === 'gemini') {
			if (typeof this.env.GEMINI_API_KEY !== 'string') {
				throw new Error('GEMINI_API_KEY not found');
			}
			return new GeminiProvider(modelName, this.env.GEMINI_API_KEY);
		} else if (providerId === 'openai') {
			if (typeof this.env.OPENAI_API_KEY !== 'string') {
				throw new Error('OPENAI_API_KEY not found');
			}
			return new OpenaiProvider(modelName, this.env.OPENAI_API_KEY);
		} else if (providerId === 'reverser') {
			return new ReverserProvider();
		}
		throw new Error(`Unknown provider: ${providerId}`);
	}
}
