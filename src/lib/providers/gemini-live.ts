import type {
  ConversationPrompt,
  ModelProvider,
  ModelUpdate,
  NormalizedProviderConfig,
  RunContext,
  TokenUsage,
} from '$lib/types';
import { fileToBase64 } from '$lib/utils/media';
import { blobToFileReference } from '$lib/storage/dereferenceFilePaths';
import { Semaphore } from '$lib/utils/semaphore';
import { CHROME_CONCURRENT_REQUEST_LIMIT_PER_DOMAIN } from './common';
import {
  GoogleGenAI,
  Modality,
  type Content,
  type Part,
  type LiveServerMessage,
} from '@google/genai';
import { WaveFile } from 'wavefile';

const GEMINI_SEMAPHORE = new Semaphore(CHROME_CONCURRENT_REQUEST_LIMIT_PER_DOMAIN);

export class GeminiLiveProvider implements ModelProvider {
  constructor(
    public model: string,
    public apiKey: string,
    public config: NormalizedProviderConfig = {},
  ) {}

  get id(): string {
    return `gemini-live:${this.model}`;
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

  run(conversation: ConversationPrompt, _context: RunContext) {
    const systemInstructionParts: string[] = [];
    for (const message of conversation) {
      if (message.role === 'system') {
        for (const part of message.content) {
          if ('text' in part) {
            systemInstructionParts.push(part.text);
          }
        }
      }
    }
    const systemInstruction = systemInstructionParts.join('\n');

    const request = {
      model: this.model,
      config: this.config,
      systemInstruction,
      conversation,
    };

    const runModel = async function* (
      this: GeminiLiveProvider,
    ): AsyncGenerator<ModelUpdate, { parts: Part[] } | undefined, void> {
      console.log('Starting Gemini Live API session', this.id, this.apiKey);
      const ai = new GoogleGenAI({
        apiKey: this.apiKey,
      });

      const responseQueue: LiveServerMessage[] = [];
      const errorQueue: Error[] = [];
      let isClosed = false;

      const uuid = crypto.randomUUID();
      let resolveSetupComplete: () => void;
      const setupCompletePromise = new Promise<void>((resolve) => {
        resolveSetupComplete = resolve;
      });

      const session = await ai.live.connect({
        model: this.model,
        config: {
          responseModalities: [Modality.AUDIO, Modality.TEXT],
          systemInstruction: systemInstruction || undefined,
          ...this.config,
        },
        callbacks: {
          onopen: () => {
            console.log(`[${uuid}] Gemini Live API connected`);
          },
          onmessage: (message) => {
            console.log(`[${uuid}] Gemini Live API message:`, message);
            if ('setupComplete' in message) {
              resolveSetupComplete();
            } else {
              responseQueue.push(message);
            }
          },
          onerror: (e) => {
            console.error(`[${uuid}] Gemini Live API Error:`, e);
            errorQueue.push(e instanceof Error ? e : new Error(e.message));
          },
          onclose: () => {
            console.log(`[${uuid}] Gemini Live API closed`);
            isClosed = true;
          },
        },
      });

      // Send the conversation history
      for (const message of conversation) {
        if (message.role === 'user' || message.role === 'assistant') {
          const content: Content = {
            role: message.role === 'user' ? 'user' : 'model',
            parts: [],
          };

          const audioParts: File[] = [];

          for (const part of message.content) {
            if ('text' in part) {
              content.parts ??= [];
              content.parts.push({ text: part.text });
            } else if ('file' in part) {
              const { file } = part;
              if (file.type === 'audio/wav') {
                // Only WAV files are supported for real-time sessions
                // TODO: Add video support (TBD what format)
                audioParts.push(file);
              } else {
                const b64 = await fileToBase64(file);
                const data = b64.slice(b64.indexOf(',') + 1);
                content.parts ??= [];
                content.parts.push({
                  inlineData: {
                    data,
                    mimeType: file.type,
                  },
                });
              }
            }
          }

          await setupCompletePromise;

          if (content.parts?.length) {
            console.log(`[${uuid}] Gemini Live API sending client content:`, content);
            session.sendClientContent({ turns: [content] });
          }

          for (const audioFile of audioParts) {
            const buffer = await audioFile.arrayBuffer();
            const wav = new WaveFile();
            wav.fromBuffer(new Uint8Array(buffer));
            wav.toSampleRate(16000);
            wav.toBitDepth('16');
            const base64Audio = wav.toBase64();

            console.log(`[${uuid}] Gemini Live API sending realtime input:`, {
              audio: {
                data: base64Audio,
                mimeType: 'audio/pcm;rate=16000',
              },
            });
            session.sendRealtimeInput({
              audio: {
                data: base64Audio,
                mimeType: 'audio/pcm;rate=16000',
              },
            });
          }
        }
      }

      const fullResponseParts: Part[] = [];

      while (!isClosed || responseQueue.length > 0) {
        if (errorQueue.length > 0) {
          const error = errorQueue.shift();
          if (error) throw error;
        }

        const message = responseQueue.shift();
        if (message) {
          if ('data' in message && message.data) {
            // audio
            const byteCharacters = atob(message.data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'audio/wav' });
            fullResponseParts.push({ inlineData: { mimeType: 'audio/wav', data: message.data } });
            yield { type: 'append', output: await blobToFileReference(blob) };
          }

          if ('serverContent' in message && message.serverContent?.modelTurn?.parts) {
            const part = message.serverContent.modelTurn.parts[0];
            if (part.text) {
              fullResponseParts.push(part);
              yield { type: 'append', output: part.text };
            }
          }
        } else {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      session.close();

      // This is a mock response to satisfy the type checker.
      // A proper implementation would construct a valid GenerateContentResponse.
      return {
        parts: fullResponseParts,
      };
    };

    return {
      request,
      runModel: runModel.bind(this),
    };
  }
  extractOutput(response: unknown): (string | Blob)[] {
    const genResponse = response as { parts: Part[] };
    return genResponse.parts
      .filter((p) => 'text' in p || 'inlineData' in p)
      .map((p): string | Blob => {
        if ('text' in p) {
          return p.text ?? '';
        }
        if ('inlineData' in p) {
          // Convert base64 to blob
          const byteCharacters = atob(p.inlineData?.data ?? '');
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          return new Blob([byteArray], { type: p.inlineData?.mimeType ?? '' });
        }
        throw new Error('Invalid part');
      });
  }

  extractTokenUsage(_response: unknown): TokenUsage {
    // This needs to be implemented.
    return {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
  }
}
