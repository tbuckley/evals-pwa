import type { ModelProvider } from '$lib/types';
import { OpenaiCompletionsProvider } from './openai-completions';

export class OllamaProvider extends OpenaiCompletionsProvider implements ModelProvider {
  constructor(
    public model: string,
    public apiKey: string,
    config = {},
  ) {
    super(model, apiKey, config, () => 0);
  }

  get id(): string {
    return `ollama:${this.model}`;
  }

  mimeTypes = ['*/*'];
}
