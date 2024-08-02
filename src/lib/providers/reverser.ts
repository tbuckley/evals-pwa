import type { ModelProvider, MultiPartPrompt, TokenUsage } from '$lib/types';

export class ReverserProvider implements ModelProvider {
	async run(prompt: MultiPartPrompt): Promise<unknown> {
		const textParts = prompt.filter((part) => 'text' in part) as { text: string }[];
		const text = textParts.map((part) => part.text).join('\n');
		return { reversed: reverseString(text) };
	}

	extractOutput(response: unknown): string {
		if (
			typeof response === 'object' &&
			response !== null &&
			'reversed' in response &&
			typeof response.reversed === 'string'
		) {
			return response.reversed;
		}
		throw new Error('Unexpected output format');
	}

	extractTokenUsage(): TokenUsage {
		return {
			inputTokens: 0,
			outputTokens: 0,
			totalTokens: 0,
			costDollars: 0
		};
	}
}

function reverseString(str: string): string {
	return str.split('').reverse().join('');
}
