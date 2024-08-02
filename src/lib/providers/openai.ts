import type { ModelProvider, MultiPartPrompt, PromptPart, TokenUsage } from '$lib/types';
import { fileToBase64 } from '$lib/utils/media';
import { z } from 'zod';

const generateContentResponseSchema = z.object({
	id: z.string(),
	choices: z.array(
		z.object({
			message: z.object({
				content: z.string().nullable(),
				role: z.string()
			})
		})
	),
	usage: z.object({
		completion_tokens: z.number().int(),
		prompt_tokens: z.number().int(),
		total_tokens: z.number().int()
	})
});

export class OpenaiProvider implements ModelProvider {
	constructor(
		public model: string,
		public apiKey: string
	) {}

	async run(prompt: MultiPartPrompt): Promise<unknown> {
		const resp = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.apiKey}`
			},
			body: JSON.stringify({
				model: this.model,
				messages: [
					{
						role: 'user',
						content: await Promise.all(prompt.map(multiPartPromptToOpenAI))
					}
				]
			})
		});
		if (!resp.ok) {
			throw new Error(`Failed to run model: ${resp.statusText}`);
		}

		const json = await resp.json();
		return generateContentResponseSchema.parse(json);
	}

	extractOutput(response: unknown): string {
		const json = generateContentResponseSchema.parse(response);
		const firstChoice = json.choices[0].message.content;
		if (typeof firstChoice === 'string') {
			return firstChoice;
		}

		throw new Error('Unexpected output format');
	}

	extractTokenUsage(response: unknown): TokenUsage {
		const json = generateContentResponseSchema.parse(response);

		const { completion_tokens, prompt_tokens, total_tokens } = json.usage;
		return {
			inputTokens: prompt_tokens,
			outputTokens: completion_tokens,
			totalTokens: total_tokens,
			costDollars: getCost(this.model, prompt_tokens, completion_tokens)
		};
	}
}

function getCost(model: string, prompt: number, completion: number): number | undefined {
	// As of July 18 2024
	let inputCostPerMillion: number, outputCostPerMillion: number;
	if (model.startsWith('gpt-4o-mini')) {
		inputCostPerMillion = 0.15;
		outputCostPerMillion = 0.6;
	} else if (model.startsWith('gpt-4o')) {
		inputCostPerMillion = 5;
		outputCostPerMillion = 15;
	} else if (model.startsWith('gpt-4-turbo')) {
		inputCostPerMillion = 10;
		outputCostPerMillion = 30;
	} else if (model.startsWith('gpt-3.5-turbo-0125')) {
		inputCostPerMillion = 0.5;
		outputCostPerMillion = 1.5;
	} else {
		return undefined;
	}

	return (prompt * inputCostPerMillion + completion * outputCostPerMillion) / 1000000;
}

type Part =
	| { type: 'text'; text: string }
	| { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } };

async function multiPartPromptToOpenAI(part: PromptPart): Promise<Part> {
	if ('text' in part) {
		return { type: 'text', text: part.text };
	} else if ('image' in part) {
		const b64 = await fileToBase64(part.image);

		return {
			type: 'image_url',
			image_url: {
				url: b64,
				detail: 'auto'
			}
		};
	} else {
		throw new Error('Unsupported part type');
	}
}
