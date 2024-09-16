import type { ModelProvider } from '$lib/types';
import { OpenaiProvider } from './openai';

export class OllamaProvider extends OpenaiProvider implements ModelProvider {
  constructor(
    public model: string,
    public apiKey: string,
    config = {},
  ) {
    super(model, apiKey, config, () => 0);
  }

  mimeTypes = ['*/*'];
}
