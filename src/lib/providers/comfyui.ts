import { blobToFileReference } from '$lib/storage/dereferenceFilePaths';
import { FileReference } from '$lib/storage/FileReference';
import {
  normalizedProviderConfigSchema,
  type ConversationPrompt,
  type ModelProvider,
  type RunContext,
  type TokenUsage,
} from '$lib/types';
import { z } from 'zod';

const configSchema = normalizedProviderConfigSchema
  .extend({
    apiBaseUrl: z.string().optional(),
  })
  .passthrough();

export class ComfyuiProvider implements ModelProvider {
  private apiBaseUrl: string;

  constructor(
    public model: string,
    public config = {},
  ) {
    const { apiBaseUrl } = configSchema.parse(config);
    this.apiBaseUrl = apiBaseUrl ?? 'http://localhost:8188';
  }

  get id(): string {
    return `comfyui:${this.model}`;
  }

  mimeTypes = ['*/*'];

  run(conversation: ConversationPrompt, context: RunContext) {
    if (conversation.length > 1 || conversation[0].role !== 'user') {
      throw new Error('Invalid ComfyUI prompt, must not be a conversation');
    }

    const files: File[] = [];
    const promptString = conversation[0].content
      .map((part) => {
        if ('file' in part) {
          files.push(part.file);
          return part.file.name;
        }
        return part.text;
      })
      .join('');

    let prompt: unknown;
    try {
      prompt = JSON.parse(promptString);
    } catch {
      throw new Error('Prompt is not valid JSON. Remember to wrap file vars in quotes.');
    }

    const uploadImage = this.uploadImage.bind(this);
    const queueWorkflow = this.queueWorkflow.bind(this);
    const getWorkflowHistory = this.getWorkflowHistory.bind(this);
    const downloadImage = this.downloadImage.bind(this);
    return {
      request: {
        prompt,
        files,
      },
      runModel: async function* run() {
        yield '';

        // Upload the files
        for (const file of files) {
          // TODO run in parallel?
          const { name } = await uploadImage(file, context.abortSignal);
          console.info(`ComfyuiProvider uploaded file: ${name}`);
        }

        const { prompt_id } = await queueWorkflow(prompt, context.abortSignal);
        let history: HistoryResponse;
        do {
          history = await getWorkflowHistory(prompt_id, context.abortSignal);
          // Sleep for 1 second
          // TODO: use websocket?
          await new Promise((resolve) => setTimeout(resolve, 1000));
          if (context.abortSignal.aborted) {
            // TODO exit gracefully?
            throw new Error('Aborted');
          }
        } while (!history[prompt_id]?.status?.completed);

        // Get the output images
        const outputs = history[prompt_id].outputs;
        if (!outputs) {
          return { output: null };
        }

        const outputImages = Object.values(outputs).flatMap((output) => output.images ?? []);
        const outputFiles = await Promise.all(
          outputImages.map((image) =>
            downloadImage(image.filename, image.subfolder, image.type, context.abortSignal),
          ),
        );

        return Promise.all(outputFiles.map((file) => blobToFileReference(file)));
      },
    };
  }

  extractOutput(response: unknown): (string | Blob)[] {
    console.log('extractOutput', response);
    if (Array.isArray(response)) {
      if (response.every((el) => el instanceof FileReference)) {
        return response.map((el) => el.file);
      }
    }
    throw new Error('Invalid ComfyUI output');
  }

  extractTokenUsage(_response: unknown): TokenUsage {
    return {};
  }

  private async uploadImage(image: File, abortSignal: AbortSignal): Promise<UploadImageResponse> {
    const formData = new FormData();
    formData.append('image', image, image.name);
    formData.append('type', 'input');
    formData.append('overwrite', 'true');

    const response = await fetch(`${this.apiBaseUrl}/upload/image`, {
      method: 'POST',
      body: formData,
      signal: abortSignal,
    });

    const result = uploadImageResponseSchema.parse(await response.json());
    return result;
  }

  private async queueWorkflow(
    workflow: unknown,
    abortSignal: AbortSignal,
  ): Promise<QueueWorkflowResponse> {
    const payload = {
      prompt: workflow,
      client_id: crypto.randomUUID(), // Generate a random client ID
    };

    const response = await fetch(`${this.apiBaseUrl}/prompt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: abortSignal,
    });

    return queueWorkflowResponseSchema.parse(await response.json());
  }

  private async getWorkflowHistory(
    workflowId: string,
    abortSignal: AbortSignal,
  ): Promise<HistoryResponse> {
    const response = await fetch(`${this.apiBaseUrl}/history/${workflowId}`, {
      signal: abortSignal,
    });
    return historyResponseSchema.parse(await response.json());
  }

  private async downloadImage(
    filename: string,
    subfolder: string,
    folderType: string,
    abortSignal: AbortSignal,
  ): Promise<File> {
    const params = new URLSearchParams({
      filename,
      subfolder,
      type: folderType,
    });

    const response = await fetch(`${this.apiBaseUrl}/view?${params}`, {
      signal: abortSignal,
    });
    const arrayBuffer = await response.arrayBuffer();
    // FIXME: use filetype to determine mime type
    return new File([arrayBuffer], filename, { type: 'image/png' });
  }
}

const uploadImageResponseSchema = z.object({
  name: z.string(),
  // TODO add more fields
});

type UploadImageResponse = z.infer<typeof uploadImageResponseSchema>;

const queueWorkflowResponseSchema = z.object({
  prompt_id: z.string(),
  // TODO add more fields
});

type QueueWorkflowResponse = z.infer<typeof queueWorkflowResponseSchema>;

const historyResponseSchema = z.record(
  z.string(),
  z
    .object({
      status: z
        .object({
          completed: z.boolean(),
        })
        .optional(),
      outputs: z
        .record(
          z.string(),
          z.object({
            images: z
              .array(
                z.object({
                  filename: z.string(),
                  subfolder: z.string(),
                  type: z.string(),
                }),
              )
              .optional(),
          }),
        )
        .optional(),
    })
    .optional(),
);

type HistoryResponse = z.infer<typeof historyResponseSchema>;
