import type {
  ModelProvider,
  MultiPartPrompt,
  NormalizedProviderConfig,
  RunContext,
  TokenUsage,
} from '$lib/types';
import { iterateStream } from '$lib/utils/iterateStream';
import { fileToBase64 } from '$lib/utils/media';
import { z } from 'zod';

export const partSchema = z.union([
  z.object({ text: z.string() }),
  z.object({
    inlineData: z.object({
      mimeType: z.string(),
      data: z.string(),
    }),
  }),
  z.object({
    functionCall: z.object({
      name: z.string(),
      args: z.record(z.unknown()),
    }),
  }),
  z.object({
    functionResponse: z.object({
      name: z.string(),
      response: z.record(z.unknown()),
    }),
  }),
  z.object({
    fileData: z.object({
      mimeType: z.string(),
      data: z.string(),
    }),
  }),
]);
export type Part = z.infer<typeof partSchema>;

export const contentSchema = z.object({
  parts: z.array(partSchema),
  role: z.string().optional(),
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
        topK: z.number().int().optional(),
      })
      .optional(),
  })
  .strict();

export const generateContentResponseSchema = z.object({
  candidates: z.array(
    z.object({
      content: contentSchema,
      finishReason: z.string().optional(), // TODO use enum
      // tokenCount: z.number().int()
      // index: z.number().int()

      // safetyRatings: z.unknown(), // TODO declare
      // citationMetadata: z.unknown(), // TODO declare
      // groundingAttributions: z.array(z.unknown()) // TODO declare
    }),
  ),
  // promptFeedback: z.unknown(), // TODO declare
  usageMetadata: z.object({
    promptTokenCount: z.number().int(),
    cachedContentTokenCount: z.number().int().optional(),
    candidatesTokenCount: z.number().int().optional(), // Only included in final message
    totalTokenCount: z.number().int(),
  }),
});

export type Request = z.infer<typeof requestSchema>;

export class GeminiProvider implements ModelProvider {
  constructor(
    public model: string,
    public apiKey: string,
    public config: NormalizedProviderConfig = {},
  ) {
    const { mimeTypes } = config;
    if (mimeTypes) {
      this.mimeTypes = mimeTypes;
    }
  }

  mimeTypes = [
    // Image
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/heic',
    'image/heif',

    // Video
    'video/mp4',
    'video/mpeg',
    'video/mov',
    'video/avi',
    'video/x-flv',
    'video/mpg',
    'video/webm',
    'video/wmv',
    'video/3gpp',

    // Audio
    'audio/wav',
    'audio/mp3',
    'audio/aiff',
    'audio/aac',
    'audio/ogg',
    'audio/flac',

    // Document
    'application/pdf',
  ];

  async *run(prompt: MultiPartPrompt, context: RunContext): AsyncGenerator<string, unknown, void> {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...this.config,
          contents: [{ parts: await multiPartPromptToGemini(prompt) }],
        }),
        signal: context.abortSignal,
      },
    );
    if (!resp.ok) {
      throw new Error(`Failed to run model: ${resp.statusText}`);
    }
    const stream = resp.body;
    let fullText = '';
    let lastResponseJson: unknown;
    if (!stream) throw new Error(`Failed to run model: no response`);
    for await (const chunk of iterateStream(stream.pipeThrough(new TextDecoderStream()))) {
      // In case multiple chunks arrive at once
      const chunks = chunk.split('\r\n\r\n').filter((chunk) => chunk.startsWith('data: '));
      if (chunks.length === 0) {
        continue;
      }

      for (const chunk of chunks) {
        const value = chunk.substring(6);
        lastResponseJson = JSON.parse(value);
        const text = this.extractOutput(lastResponseJson);
        fullText += text;
        yield text;
      }
    }

    const parsed = generateContentResponseSchema.parse(lastResponseJson);
    parsed.candidates[0].content.parts[0] = { text: fullText };
    return parsed;
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
      costDollars: getCost(this.model, promptTokenCount, candidatesTokenCount ?? 0),
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
    } else if ('file' in part) {
      const b64 = await fileToBase64(part.file);
      const firstComma = b64.indexOf(',');

      parts.push({
        inlineData: {
          mimeType: part.file.type,
          data: b64.slice(firstComma + 1),
        },
      });
    } else {
      throw new Error('Unsupported part type');
    }
  }
  return parts;
}
