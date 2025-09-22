import type { ModelProvider } from '$lib/types';
import { GeminiProvider } from './gemini';
import { OpenaiCompletionsProvider, type OpenaiConfig } from './openai-completions';
import { OpenaiResponsesProvider } from './openai-responses';
import { ReverserProvider } from './reverser';
import { ChromeProvider } from './chrome';
import { OllamaProvider } from './ollama';
import { WebLlm } from './web-llm';
import { AnthropicProvider } from './anthropic';
import { DalleProvider } from './dalle';
import { ComfyuiProvider } from './comfyui';
import { EchoProvider } from './echo';
import { GeminiLiveProvider } from './gemini-live';

export class ProviderManager {
  constructor(public env: Record<string, string>) {}

  getProvider(id: string, config: object = {}): ModelProvider {
    // id is in the format providerId:modelName, for example gemini:gemini-1.5-pro-latest
    const index = id.indexOf(':');
    if (index === -1) {
      throw new Error(`Invalid provider id: ${id}`);
    }
    const providerId = id.slice(0, index);
    const modelName = id.slice(index + 1);

    if (providerId === 'gemini') {
      if (typeof this.env.GEMINI_API_KEY !== 'string') {
        throw new Error('GEMINI_API_KEY not found');
      }
      return new GeminiProvider(modelName, this.env.GEMINI_API_KEY, config);
    } else if (providerId === 'gemini-live') {
      if (typeof this.env.GEMINI_API_KEY !== 'string') {
        throw new Error('GEMINI_API_KEY not found');
      }
      return new GeminiLiveProvider(modelName, this.env.GEMINI_API_KEY, config);
    } else if (providerId === 'openai') {
      if (typeof this.env.OPENAI_API_KEY !== 'string') {
        throw new Error('OPENAI_API_KEY not found');
      }
      return new OpenaiCompletionsProvider(modelName, this.env.OPENAI_API_KEY, config);
    } else if (providerId === 'openai-responses') {
      if (typeof this.env.OPENAI_API_KEY !== 'string') {
        throw new Error('OPENAI_API_KEY not found');
      }
      return new OpenaiResponsesProvider(modelName, this.env.OPENAI_API_KEY, config);
    } else if (providerId === 'dalle') {
      if (typeof this.env.OPENAI_API_KEY !== 'string') {
        throw new Error('OPENAI_API_KEY not found');
      }
      return new DalleProvider(modelName, this.env.OPENAI_API_KEY, config);
    } else if (providerId === 'anthropic') {
      if (typeof this.env.ANTHROPIC_API_KEY !== 'string') {
        throw new Error('ANTHROPIC_API_KEY not found');
      }
      return new AnthropicProvider(modelName, this.env.ANTHROPIC_API_KEY, config);
    } else if (providerId === 'reverser') {
      return new ReverserProvider(modelName);
    } else if (providerId === 'echo') {
      return new EchoProvider(modelName);
    } else if (providerId === 'chrome' && modelName === 'ai') {
      return new ChromeProvider(config);
    } else if (providerId === 'web-llm') {
      return new WebLlm(modelName);
    } else if (providerId === 'ollama') {
      if ((config as OpenaiConfig).apiBaseUrl === undefined) {
        if (typeof this.env.OLLAMA_ENDPOINT !== 'string') {
          throw new Error('OLLAMA_ENDPOINT not found');
        }
        (config as OpenaiConfig).apiBaseUrl = this.env.OLLAMA_ENDPOINT;
      }
      return new OllamaProvider(modelName, 'no-key', config);
    } else if (providerId === 'comfyui') {
      return new ComfyuiProvider(modelName, config);
    }
    throw new Error(`Unknown provider: ${providerId}`);
  }

  getRequiredEnvVars(id: string): string[] {
    const index = id.indexOf(':');
    if (index === -1) {
      throw new Error(`Invalid provider id: ${id}`);
    }
    const providerId = id.slice(0, index);

    if (providerId === 'gemini' || providerId === 'gemini-live') {
      return ['GEMINI_API_KEY'];
    } else if (
      providerId === 'openai' ||
      providerId === 'dalle' ||
      providerId === 'openai-responses'
    ) {
      return ['OPENAI_API_KEY'];
    } else if (providerId === 'anthropic') {
      return ['ANTHROPIC_API_KEY'];
    } else if (providerId === 'reverser') {
      return [];
    } else if (providerId === 'chrome') {
      return [];
    } else if (providerId === 'ollama') {
      return ['OLLAMA_ENDPOINT'];
    } else if (providerId === 'web-llm') {
      return [];
    } else if (providerId === 'comfyui') {
      return [];
    }
    throw new Error(`Unknown provider: ${providerId}`);
  }
}
