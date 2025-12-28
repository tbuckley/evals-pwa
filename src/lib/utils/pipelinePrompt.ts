import type { NormalizedPipelinePrompt } from '$lib/types';

export function makeSingleStepPipeline(prompt: string): NormalizedPipelinePrompt {
  return {
    $pipeline: [
      {
        id: 'step-0',
        prompt,
      },
    ],
  };
}
