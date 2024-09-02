import type { ModelProvider, MultiPartPrompt, TokenUsage } from '$lib/types';
import { fileToBase64, mimeTypeForFile } from '$lib/utils/media';
import { z } from 'zod';

export const partSchema = z.union([
	z.object({ text: z.string() }),
	z.object({
		inlineData: z.object({
			mimeType: z.string(),
			data: z.string()
		})
	}),
	z.object({
		functionCall: z.object({
			name: z.string(),
			args: z.record(z.unknown())
		})
	}),
	z.object({
		functionResponse: z.object({
			name: z.string(),
			response: z.record(z.unknown())
		})
	}),
	z.object({
		fileData: z.object({
			mimeType: z.string(),
			data: z.string()
		})
	})
]);
export type Part = z.infer<typeof partSchema>;

export const contentSchema = z.object({
	parts: z.array(partSchema),
	role: z.string().optional()
});

export const requestSchema = z
	.object({
		contents: z.array(contentSchema),
		tools: z.unknown(), // TODO declare
		toolConfig: z.unknown(), // TODO declare
		safetySettings: z.unknown(), // TODO declare
		systemInstruction: contentSchema.optional(),
		generationConfig: z
			.object({
				stopSequences: z.array(z.string()).optional(),
				responseMimeType: z.enum(['text/plain', 'application/json']).optional(),
				responseSchema: z.unknown().optional(), // TODO declare schema
				candidateCount: z.number().int().optional(),
				maxOutputTokens: z.number().int().optional(),
				temperature: z.number().optional(),
				topP: z.number().optional(),
				topK: z.number().int().optional()
			})
			.optional()
	})
	.strict();

export const generateContentResponseSchema = z.object({
	candidates: z.array(
		z.object({
			content: contentSchema,
			finishReason: z.string().optional() // TODO use enum
			// tokenCount: z.number().int()
			// index: z.number().int()

			// safetyRatings: z.unknown(), // TODO declare
			// citationMetadata: z.unknown(), // TODO declare
			// groundingAttributions: z.array(z.unknown()) // TODO declare
		})
	),
	// promptFeedback: z.unknown(), // TODO declare
	usageMetadata: z.object({
		promptTokenCount: z.number().int(),
		cachedContentTokenCount: z.number().int().optional(),
		candidatesTokenCount: z.number().int(),
		totalTokenCount: z.number().int()
	})
});

export type Request = z.infer<typeof requestSchema>;

export class GeminiProvider implements ModelProvider {
	constructor(
		public model: string,
		public apiKey: string,
		public config: object = {}
	) {}

	async run(prompt: MultiPartPrompt): Promise<unknown> {
		const resp = await fetch(
			`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					...this.config,
					contents: [{ parts: await multiPartPromptToGemini(prompt) }]
				})
			}
		);
		if (!resp.ok) {
			throw new Error(`Failed to run model: ${resp.statusText}`);
		}

		const json = await resp.json();
		return generateContentResponseSchema.parse(json);
	}

	extractOutput(response: unknown): string {
		const json = generateContentResponseSchema.parse(response);
		const firstCandidatePart = json.candidates[0].content.parts[0];
		if ('text' in firstCandidatePart) {
			return firstCandidatePart.text;
		}
		throw new Error('Unexpected output format');
	}

	extractTokenUsage(response: unknown): TokenUsage {
		const json = generateContentResponseSchema.parse(response);

		const { promptTokenCount, candidatesTokenCount, totalTokenCount } = json.usageMetadata;

		return {
			inputTokens: promptTokenCount,
			outputTokens: candidatesTokenCount,
			totalTokens: totalTokenCount,
			costDollars: getCost(this.model, promptTokenCount, candidatesTokenCount)
		};
	}
}

function getCost(model: string, prompt: number, completion: number): number | undefined {
	// As of July 13 2024
	// Note that both costs differ if the prompt is >128k tokens
	let inputCostPerMillion: number, outputCostPerMillion: number;
	if (model.startsWith('gemini-1.5-pro')) {
		inputCostPerMillion = prompt > 128_000 ? 7 : 3.5;
		outputCostPerMillion = prompt > 128_000 ? 21 : 10.5;
	} else if (model.startsWith('gemini-1.5-flash')) {
		inputCostPerMillion = prompt > 128_000 ? 0.15 : 0.075;
		outputCostPerMillion = prompt > 128_000 ? 0.6 : 0.3;
	} else {
		return undefined;
	}

	return (prompt * inputCostPerMillion + completion * outputCostPerMillion) / 1000000;
}

async function multiPartPromptToGemini(prompt: MultiPartPrompt): Promise<Part[]> {
	const parts: Part[] = [];
	for (const part of prompt) {
		if ('text' in part) {
			parts.push({ text: part.text });
		} else if ('image' in part) {
			const b64 = await fileToBase64(part.image);
			const firstComma = b64.indexOf(',');

			parts.push({
				inlineData: {
					mimeType: mimeTypeForFile(part.image),
					data: b64.slice(firstComma + 1)
				}
			});
		} else {
			throw new Error('Unsupported part type');
		}
	}
	return parts;
}
