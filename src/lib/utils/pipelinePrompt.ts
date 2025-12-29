import type { NormalizedPipelinePrompt, NormalizedPipelineStep } from '$lib/types';

type SingleStepInput = string | (Omit<NormalizedPipelineStep, 'id'> & { id?: string });

export function makeSingleStepPipeline(step: SingleStepInput): NormalizedPipelinePrompt {
  const baseStep =
    typeof step === 'string'
      ? { prompt: step }
      : {
          ...step,
        };
  return {
    $pipeline: [
      {
        id: baseStep.id ?? 'step-0',
        ...baseStep,
      },
    ],
  };
}
