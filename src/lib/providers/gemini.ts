import type { ModelProvider } from '$lib/types';
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
		public apiKey: string
	) {}

	async run(prompt: string): Promise<unknown> {
		// const request = requestSchema.parse(prompt);
		const resp = await fetch(
			`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					contents: [{ parts: [{ text: prompt }] }]
				})
			}
		);
		if (!resp.ok) {
			throw new Error(`Failed to run model: ${resp.statusText}`);
		}

		const json = await resp.json();
		return generateContentResponseSchema.parse(json);
	}

	extractOutput(output: unknown): string {
		const json = generateContentResponseSchema.parse(output);
		const firstCandidatePart = json.candidates[0].content.parts[0];
		if ('text' in firstCandidatePart) {
			return firstCandidatePart.text;
		}
		throw new Error('Unexpected output format');
	}
}
