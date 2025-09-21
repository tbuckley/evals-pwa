import {
  normalizedProviderConfigSchema,
  type ConversationPrompt,
  type ModelProvider,
  type MultiPartPrompt,
  type RunContext,
  type TokenUsage,
} from '$lib/types';
import { z } from 'zod';
import { conversationToSinglePrompt } from './legacyProvider';
import { decodeB64Blob, fileToBase64 } from '$lib/utils/media';

const dalleResponseSchema = z.object({
  created: z.number(),
  data: z.array(
    z.object({
      revised_prompt: z.string().optional(),
      b64_json: z.string(),
    }),
  ),
  usage: z
    .object({
      total_tokens: z.number().optional(),
      input_tokens: z.number().optional(),
      output_tokens: z.number().optional(),
      input_tokens_details: z
        .object({
          text_tokens: z.number().optional(),
          image_tokens: z.number().optional(),
        })
        .optional(),
    })
    .optional(),
});

const configSchema = normalizedProviderConfigSchema
  .extend({
    size: z.string().optional(),
    quality: z.string().optional(),
  })
  .passthrough();
export type DalleConfig = z.infer<typeof configSchema>;

export class DalleProvider implements ModelProvider {
  private request: Omit<DalleConfig, 'mimeTypes'>;
  constructor(
    public model: string,
    public apiKey: string,
    config = {},
  ) {
    const { mimeTypes: _mimeTypes, ...request } = configSchema.parse(config);
    this.request = request;
  }

  get id(): string {
    return `dalle:${this.model}`;
  }

  mimeTypes = ['image/png', 'image/jpeg', 'image/webp'];

  async run(conversation: ConversationPrompt, context: RunContext) {
    const prompt = conversationToSinglePrompt(conversation);

    const images = multiPartPromptToFiles(prompt);

    const imagesForHashing = await Promise.all(images.map(fileToBase64));

    const request = {
      model: this.model,
      ...this.request,
      prompt: multiPartPromptToString(prompt),
      // Include image data for hashing
      image: imagesForHashing.length > 0 ? imagesForHashing : undefined,
      // DALL-E models default to `url`, but we expect `b64_json`
      // GPT-Image-* only support `b64_json` but throw an error if `response_format` is specified
      response_format: this.model.startsWith('dall-e') ? 'b64_json' : undefined,
    } as const;

    console.log(request);

    const { apiKey } = this;
    return {
      request,
      runModel: async function* () {
        yield '';

        // If there are images, we need to use images/edit
        const isEdit = images.length > 0;

        let resp: Response;
        if (isEdit) {
          // Edit 1+ existing images
          // The `edit` endpoint only supports FormData :-/
          const formData = new FormData();
          for (const [key, value] of Object.entries(request)) {
            // Skip images, since they are added separately
            // Also skip non-strings, since formData will send `undefined` values
            if (key !== 'image' && typeof value === 'string') {
              formData.append(key, value);
            }
          }
          for (const image of images) {
            formData.append('image[]', image);
          }

          resp = await fetch(`https://api.openai.com/v1/images/edits`, {
            method: 'POST',
            headers: {
              // Don't set `Content-Type` to `multipart/form-data`
              Authorization: `Bearer ${apiKey}`,
            },
            body: formData,
            signal: context.abortSignal,
          });
        } else {
          // Generate a new image
          resp = await fetch(`https://api.openai.com/v1/images/generations`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(request),
            signal: context.abortSignal,
          });
        }

        if (!resp.ok) {
          throw new Error(`Failed to run model: ${resp.statusText}`);
        }

        const json: unknown = await resp.json();
        return { response: json };
      },
    };
  }

  extractOutput(response: unknown): (Blob | string)[] {
    const json = dalleResponseSchema.parse(response);
    const firstChoice = json.data[0].b64_json;

    if (typeof firstChoice === 'string') {
      // Convert base64 to blob
      const byteArray = decodeB64Blob(firstChoice);
      const res: (Blob | string)[] = [new Blob([byteArray], { type: 'image/png' })];
      return res;
    }

    throw new Error('Unexpected output format');
  }

  extractTokenUsage(response: unknown): TokenUsage {
    if (this.model.startsWith('dall-e')) {
      return {
        costDollars: getDalleCost(
          this.model,
          (this.request.size as string | undefined) ?? '1024x1024',
          (this.request.quality as string | undefined) ?? 'standard',
        ),
      };
    }

    if (this.model.startsWith('gpt-image')) {
      const json = dalleResponseSchema.parse(response);
      const inputText = json.usage?.input_tokens_details?.text_tokens ?? 0;
      const inputImage = json.usage?.input_tokens_details?.image_tokens ?? 0;
      const outputImage = json.usage?.output_tokens ?? 0;
      return {
        costDollars: getGptImageCost(this.model, inputText, inputImage, outputImage),
      };
    }

    return {};
  }
}

function getGptImageCost(
  model: string,
  inputTextTokens: number,
  inputImageTokens: number,
  outputImageTokens: number,
): number | undefined {
  if (model === 'gpt-image-1') {
    // Input: text tokens are $5/M, image tokens are $10/M
    // Output tokens are $40/M (image-only)
    return (inputTextTokens * 5 + inputImageTokens * 10 + outputImageTokens * 40) / 1000000;
  }
  return undefined;
}

function getDalleCost(model: string, size: string, quality = 'standard'): number | undefined {
  if (model === 'dall-e-3' && quality === 'standard') {
    switch (size) {
      case '1024x1024':
        return 0.04;
      case '1792x1024':
        return 0.08;
      case '1024x1792':
        return 0.08;
      default:
        return undefined;
    }
  }

  if (model === 'dall-e-3' && quality === 'hd') {
    switch (size) {
      case '1024x1024':
        return 0.08;
      case '1792x1024':
        return 0.12;
      case '1024x1792':
        return 0.12;
      default:
        return undefined;
    }
  }

  if (model === 'dall-e-2') {
    switch (size) {
      case '1024x1024':
        return 0.02;
      case '512x512':
        return 0.018;
      case '256x256':
        return 0.016;
      default:
        return undefined;
    }
  }
}

function multiPartPromptToString(prompt: MultiPartPrompt): string {
  return prompt
    .filter((p): p is { text: string } => 'text' in p)
    .map((p) => p.text)
    .join(' ');
}

function multiPartPromptToFiles(prompt: MultiPartPrompt): File[] {
  return prompt.filter((p): p is { file: File } => 'file' in p).map((part) => part.file);
}
