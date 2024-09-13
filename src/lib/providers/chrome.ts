import type { ModelProvider, MultiPartPrompt, TokenUsage } from '$lib/types';

interface PromptAPI {
	createTextSession(): Promise<PromptSession>;
}

interface PromptSession {
	prompt(prompt: string): Promise<string>;
}

declare global {
	interface Window {
		ai: PromptAPI;
	}
}

export class ChromeProvider implements ModelProvider {
	async *run(prompt: MultiPartPrompt) {
		yield '';
		const session = await window.ai.createTextSession();
		return session.prompt(prompt.map((part) => ('text' in part ? part.text : '')).join('\n'));
	}

	extractOutput(response: unknown): string {
		if (typeof response === 'string') {
			return response;
		}
		throw new Error('Unexpected output format');
	}

	extractTokenUsage(): TokenUsage {
		return {
			costDollars: 0
		};
	}
}
