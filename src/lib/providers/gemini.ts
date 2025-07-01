import type {
  ConversationPrompt,
  ModelProvider,
  ModelUpdate,
  MultiPartPrompt,
  NormalizedProviderConfig,
  RunContext,
  TokenUsage,
} from '$lib/types';
import { sse } from '$lib/utils/sse';
import { fileToBase64 } from '$lib/utils/media';
import { z } from 'zod';
import { blobToFileReference } from '$lib/storage/dereferenceFilePaths';
import { Semaphore } from '$lib/utils/semaphore';
import { CHROME_CONCURRENT_REQUEST_LIMIT_PER_DOMAIN } from './common';
import { exponentialBackoff, shouldRetryHttpError } from '$lib/utils/exponentialBackoff';

const GEMINI_SEMAPHORE = new Semaphore(CHROME_CONCURRENT_REQUEST_LIMIT_PER_DOMAIN);

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
  parts: z.array(partSchema).optional(),
  role: z.union([z.literal('user'), z.literal('model')]).optional(),
});
export type Content = z.infer<typeof contentSchema>;

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

const errorSchema = z.object({
  error: z.object({
    message: z.string(),
  }),
});

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

  get id(): string {
    return `gemini:${this.model}`;
  }

  get requestSemaphore(): Semaphore {
    return GEMINI_SEMAPHORE;
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

  async run(conversation: ConversationPrompt, context: RunContext) {
    const contents = await conversationToGemini(conversation);
    const systemContent = await conversationToSystemContent(conversation);
    const extensions: { systemInstruction?: Content } = {};
    if (systemContent) {
      extensions.systemInstruction = systemContent;
    }

    const request = {
      ...this.config,
      ...extensions,
      contents,
    } as const;

    const { apiKey, model } = this;
    const extractOutput = this.extractOutput.bind(this);
    const getResponseParts = this.getResponseParts.bind(this);
    return {
      request,
      runModel: async function* () {
        const resp = await exponentialBackoff(async () => {
          const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(request),
              signal: context.abortSignal,
            },
          );
          if (!resp.ok) {
            let error;
            try {
              const json: unknown = await resp.json();
              error = errorSchema.parse(json);
            } catch {
              throw new Error(`Failed to run model: ${resp.statusText} ${resp.status}`);
            }
            throw new Error(`Failed to run model: ${error.error.message}`);
          }
          return resp;
        }, { shouldRetry: shouldRetryHttpError });
        const stream = resp.body;
        const fullResponse: Part[] = [];

        let lastResponseJson: unknown;
        if (!stream) throw new Error(`Failed to run model: no response`);
        for await (const value of sse(resp)) {
          lastResponseJson = JSON.parse(value);
          const parts = getResponseParts(lastResponseJson);
          for (const part of parts) {
            // Try appending text to the last part if it's also text
            if (
              'text' in part &&
              fullResponse.length > 0 &&
              'text' in fullResponse[fullResponse.length - 1]
            ) {
              (fullResponse[fullResponse.length - 1] as { text: string }).text += part.text;
            } else {
              fullResponse.push(part);
            }
          }

          const output = extractOutput(lastResponseJson);
          for (const part of output) {
            if (typeof part === 'string') {
              yield { type: 'append', output: part } as ModelUpdate;
            } else {
              yield { type: 'append', output: await blobToFileReference(part) } as ModelUpdate;
            }
          }
        }

        const parsed = generateContentResponseSchema.parse(lastResponseJson);
        parsed.candidates[0].content.parts ??= [];

        parsed.candidates[0].content.parts = fullResponse;
        return parsed;
      },
    };
  }

  private getResponseParts(response: unknown): Part[] {
    const json = generateContentResponseSchema.parse(response);
    const firstCandidateContent = json.candidates[0].content;
    if (!firstCandidateContent.parts) {
      return []; // Sometimes it is empty at the end of the stream
    }
    return firstCandidateContent.parts;
  }

  extractOutput(response: unknown): (string | Blob)[] {
    const parts = this.getResponseParts(response);

    return parts.map((part): string | Blob => {
      if ('text' in part) {
        return part.text;
      }
      if ('inlineData' in part) {
        const byteCharacters = atob(part.inlineData.data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: part.inlineData.mimeType });
      }
      throw new Error('Unexpected output format');
    });
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
  if (model.startsWith('gemini-2.5-pro')) {
    inputCostPerMillion = prompt <= 200_000 ? 1.25 : 2.5;
    outputCostPerMillion = prompt <= 200_000 ? 10 : 15;
  } else if (model.startsWith('gemini-2.5-flash')) {
    // TODO: depends on audio vs other media
    inputCostPerMillion = 0.15; // Or 1.0 for audio
    // TODO: depends on thinking vs non-thinking
    outputCostPerMillion = 0.6; // Or 3.5 for thinking
  } else if (model.startsWith('gemini-2.0-flash-lite')) {
    inputCostPerMillion = 0.075;
    outputCostPerMillion = 0.03;
  } else if (model.startsWith('gemini-2.0-flash')) {
    inputCostPerMillion = 0.1;
    outputCostPerMillion = 0.4;
  } else if (model.startsWith('gemini-1.5-pro')) {
    inputCostPerMillion = prompt > 128_000 ? 2.5 : 1.25;
    outputCostPerMillion = prompt > 128_000 ? 10 : 5;
  } else if (model.startsWith('gemini-1.5-flash-8b')) {
    inputCostPerMillion = prompt > 128_000 ? 0.075 : 0.037;
    outputCostPerMillion = prompt > 128_000 ? 0.3 : 0.15;
  } else if (model.startsWith('gemini-1.5-flash')) {
    inputCostPerMillion = prompt > 128_000 ? 0.15 : 0.075;
    outputCostPerMillion = prompt > 128_000 ? 0.6 : 0.3;
  } else {
    return undefined;
  }

  return (prompt * inputCostPerMillion + completion * outputCostPerMillion) / 1000000;
}

async function conversationToGemini(conversation: ConversationPrompt): Promise<Content[]> {
  const contents = await Promise.all(
    conversation.map(async (part): Promise<Content | null> => {
      if (part.role === 'user') {
        return { role: 'user', parts: await multiPartPromptToGemini(part.content) };
      }
      if (part.role === 'assistant') {
        return { role: 'model', parts: await multiPartPromptToGemini(part.content) };
      }

      // Ignore system messages
      return null;
    }),
  );
  const messages = contents.filter((c): c is Content => c !== null);
  if (messages.length === 1) {
    // Remove the role if there's just one message
    return [{ parts: messages[0].parts }];
  }
  return messages;
}

async function conversationToSystemContent(
  conversation: ConversationPrompt,
): Promise<Content | null> {
  const parts = await Promise.all(
    conversation.map(async (part): Promise<Part[] | null> => {
      if (part.role === 'system') {
        return multiPartPromptToGemini(part.content);
      }
      return null;
    }),
  );

  // TODO filter to text parts
  const systemParts = parts.filter((p): p is Part[] => p !== null).flat();
  if (systemParts.length > 0) {
    return { parts: systemParts };
  }
  return null;
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
