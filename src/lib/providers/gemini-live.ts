import type {
  ConversationPrompt,
  ModelProvider,
  ModelUpdate,
  MultiPartPrompt,
  NormalizedProviderConfig,
  RunContext,
  TokenUsage,
} from '$lib/types';
import { decodeB64Blob, fileToBase64, geminiDataToWav, wavToGeminiLive } from '$lib/utils/media';
import { Semaphore } from '$lib/utils/semaphore';
import { CHROME_CONCURRENT_REQUEST_LIMIT_PER_DOMAIN } from './common';
import {
  GoogleGenAI,
  Modality,
  type Part,
  type LiveServerMessage,
  Session,
  type LiveConnectParameters,
} from '@google/genai';

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

  async run(conversation: ConversationPrompt, _context: RunContext) {
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
    const turns = await conversationToTurns(conversation);

    const request = {
      model: this.model,
      config: this.config,
      systemInstruction,
      turns,
    };

    const runModel = async function* (
      this: GeminiLiveProvider,
    ): AsyncGenerator<ModelUpdate, { parts: Part[] } | undefined, void> {
      const live = new LiveApiWrapper(this.apiKey, {
        model: this.model,
        config: {
          responseModalities: [Modality.AUDIO, Modality.TEXT],
          systemInstruction: systemInstruction || undefined,
          ...this.config,
        },
      });

      yield { type: 'append', output: 'processing...' };

      const responseParts: Part[] = [];

      // Send the conversation history
      for (const message of turns) {
        if (message.role === 'user') {
          console.log('Sending turn...', message);
          await live.sendTurn(message.turn);
          console.log('Finished turn', message);
        } else {
          // Ignore message, just wait for a turn
          console.log('Awaiting reply');
          const reply = await live.assistantTurnComplete();
          responseParts.push(...reply);
          console.log('Receive reply');
        }
      }

      const finalParts = await live.assistantTurnComplete();
      responseParts.push(...finalParts);
      await live.close();

      return {
        parts: responseParts,
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

export class LiveApiWrapper {
  private session: Session | undefined;
  private isClosed = true;

  private setupComplete: Promise<void>;
  private resolveSetupComplete!: () => void;

  private responseQueue: LiveServerMessage[] = [];
  private errorQueue: Error[] = [];

  constructor(
    private apiKey: string,
    config: Omit<LiveConnectParameters, 'callbacks'>,
  ) {
    this.setupComplete = new Promise((resolve) => {
      this.resolveSetupComplete = resolve;
    });
    void this.connect(config);
  }

  private async connect(config: Omit<LiveConnectParameters, 'callbacks'>) {
    const uuid = crypto.randomUUID();
    const ai = new GoogleGenAI({
      apiKey: this.apiKey,
    });
    this.session = await ai.live.connect({
      ...config,
      callbacks: {
        onopen: () => {
          this.isClosed = false;
          console.log(`[${uuid}] Gemini Live API connected`);
        },
        onmessage: (message) => {
          console.log(`[${uuid}] Gemini Live API message:`, message);
          if ('setupComplete' in message) {
            this.resolveSetupComplete();
          } else {
            this.responseQueue.push(message);
          }
        },
        onerror: (e) => {
          console.error(`[${uuid}] Gemini Live API Error:`, e);
          this.errorQueue.push(e instanceof Error ? e : new Error(e.message));
        },
        onclose: () => {
          console.log(`[${uuid}] Gemini Live API closed`);
          this.isClosed = true;
        },
      },
    });
  }

  private async isReady(): Promise<void> {
    await this.setupComplete;
    if (this.isClosed) {
      throw new Error('connection is already closed');
    }
  }

  async sendTurn(turn: Turn): Promise<void> {
    await this.isReady();

    if (turn.parts.length > 0) {
      this.session?.sendClientContent({
        turns: turn.parts,
        turnComplete: turn.audio.length > 0,
      });
    }
    if (turn.audio.length > 0) {
      for (const base64Audio of turn.audio) {
        this.session?.sendRealtimeInput({
          audio: {
            data: base64Audio,
            mimeType: 'audio/pcm;rate=16000',
          },
        });
      }

      // Now send 500ms of silence
      const silenceBytes = new Uint8Array(16000); // 500ms of 16kHz 16-bit PCM silence
      const base64Silence = btoa(
        // This is slow, there must be a better way to convert Uint8Array to base64 string
        silenceBytes.reduce((data, byte) => data + String.fromCharCode(byte), ''),
      );
      this.session?.sendRealtimeInput({
        audio: {
          data: base64Silence,
          mimeType: 'audio/pcm;rate=16000',
        },
      });

      // Simulate muting the microphone
      this.session?.sendRealtimeInput({ audioStreamEnd: true });
    }
  }
  async assistantTurnComplete(): Promise<Part[]> {
    await this.isReady();

    let turnOver = false;
    const fullResponseParts: Part[] = [];
    const audioBuffers: Uint8Array[] = [];

    while (!this.isClosed && !turnOver) {
      if (this.errorQueue.length > 0) {
        const error = this.errorQueue.shift();
        if (error) throw error;
      }

      const message = this.responseQueue.shift();
      if (message) {
        if ('data' in message && message.data) {
          const byteArray = decodeB64Blob(message.data);
          audioBuffers.push(byteArray);
        }

        if ('serverContent' in message && message.serverContent?.modelTurn?.parts) {
          const part = message.serverContent.modelTurn.parts[0];
          if (part.text) {
            fullResponseParts.push(part);
            // TODO yield
          }
        }

        // Detect an end from the server
        if ('serverContent' in message && message.serverContent?.turnComplete) {
          turnOver = true;
        }
      } else {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    if (audioBuffers.length > 0) {
      const wavBlob = geminiDataToWav(audioBuffers);

      const b64 = await fileToBase64(new File([wavBlob], 'audio.wav'));
      const data = b64.slice(b64.indexOf(',') + 1);

      fullResponseParts.push({ inlineData: { mimeType: 'audio/wav', data } });
      // yield blob
    }

    return fullResponseParts;
  }
  async close() {
    await this.isReady();
    this.session?.close();
  }
}

type ConversationTurn = { role: 'user'; turn: Turn } | { role: 'assistant' };

async function conversationToTurns(prompt: ConversationPrompt): Promise<ConversationTurn[]> {
  const parts = prompt
    .filter((p) => p.role === 'user' || p.role === 'assistant')
    .map(async (p) => {
      if (p.role === 'user') {
        return { role: 'user', turn: await prepareTurn(p.content) } as const;
      }
      return { role: 'assistant' } as const;
    });
  return Promise.all(parts);
}

interface Turn {
  parts: Part[];
  audio: string[];
}

async function prepareTurn(prompt: MultiPartPrompt): Promise<Turn> {
  const parts: Part[] = [];
  const audio: string[] = [];

  const audioParts: File[] = [];

  for (const part of prompt) {
    if ('text' in part) {
      parts.push({ text: part.text });
    } else if ('file' in part) {
      const { file } = part;
      if (file.type === 'audio/wav') {
        // Only WAV files are supported for real-time sessions
        // TODO: Add video support (TBD what format)
        audioParts.push(file);
      } else {
        const b64 = await fileToBase64(file);
        const data = b64.slice(b64.indexOf(',') + 1);
        parts.push({
          inlineData: {
            data,
            mimeType: file.type,
          },
        });
      }
    }
  }

  if (audioParts.length > 0) {
    for (const audioFile of audioParts) {
      const base64Audio = await wavToGeminiLive(audioFile);
      audio.push(base64Audio);
    }
  }

  return { parts, audio };
}
