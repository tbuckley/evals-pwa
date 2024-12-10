import { CodeReference, toCodeReference } from '$lib/storage/CodeReference';
import type {
  TestEnvironment,
  ModelProvider,
  TestOutput,
  VarSet,
  RunContext,
  ModelUpdate,
  ConversationPrompt,
  ModelCache,
  NormalizedPipelineStep,
  TestResult,
  NormalizedPipelinePrompt,
} from '$lib/types';
import { maybeUseCache, modelOutputToTestOutput } from './environmentHelpers';
import { HandlebarsPromptFormatter } from './HandlebarsPromptFormatter';
import { ParallelTaskQueue } from './ParallelTaskQueue';

export interface ModelConfig {
  default: ModelProvider;
  labeled: Record<string, ModelProvider>;
}

export interface Config {
  models: ModelConfig;
  pipeline: NormalizedPipelinePrompt;
  cache?: ModelCache;
}

export interface HistoryItem {
  prompt: ConversationPrompt;
  output: NonNullable<TestResult['output']>;
}
export interface PipelineVars {
  $output: NonNullable<TestResult['output']> | null;
  $history: HistoryItem[];
  [key: string]: unknown;
}

export class PipelineEnvironment implements TestEnvironment {
  models: ModelConfig;
  pipeline: NormalizedPipelinePrompt;
  cache?: ModelCache;

  constructor(options: Config) {
    this.models = options.models;
    this.pipeline = options.pipeline;
    this.cache = options.cache;
  }

  // For passing as context to assertions
  get provider() {
    return { id: this.models.default.id };
  }
  get prompt() {
    // FIXME: Return the normalized prompt
    return JSON.stringify(this.pipeline);
  }

  async *run(
    vars: VarSet,
    context: RunContext,
  ): AsyncGenerator<string | ModelUpdate, TestOutput, void> {
    const pipelineState = new PipelineState(this.pipeline.$pipeline);
    const initialPipelineVars: PipelineVars = {
      $output: null,
      $history: [],
    };

    // FIXME: Choose a better constant or make it configurable
    const taskQueue = new ParallelTaskQueue(10);
    let result: TestOutput | undefined;

    const outputVars: Record<string, unknown> = {};

    const runStep = async (step: NormalizedPipelineStep, pipelineVars: PipelineVars) => {
      // Render the prompt
      const promptFormatter = new HandlebarsPromptFormatter(step.prompt);
      const prompt = await promptFormatter.format(
        { ...vars, ...outputVars, ...pipelineVars },
        this.models.default.mimeTypes,
      );

      // Run the prompt (or read from cache)
      const model = this.models.default;
      const { request, run } = await model.run(prompt, context);
      const cacheKey = {
        provider: this.provider.id,
        request,
        ...(context.cacheKey ?? {}),
      };
      console.log('step started:', step.id);
      const generator = maybeUseCache(this.cache, cacheKey, run);
      let nextRes = await generator.next();
      while (!nextRes.done) {
        // FIXME: Output the in-progress responses somewhere
        nextRes = await generator.next();
      }
      const { response, latencyMillis } = nextRes.value;
      console.log('step finished:', step.id);

      // Extract the output
      // FIXME: catch any errors extracting output
      const rawOutput = await model.extractOutput(response);
      const output = await modelOutputToTestOutput(rawOutput);
      const tokenUsage = model.extractTokenUsage(response);

      // Add the output to the vars
      // FIXME: History won't include all of the steps that ran before
      const newPipelineVars: PipelineVars = {
        ...pipelineVars,
        $output: output,
        $history: [...pipelineVars.$history, { prompt, output }],
      };
      if (step.outputAs) {
        outputVars[step.outputAs] = output;
      }

      // Mark the step as complete and continue with the next steps
      const { isLeaf, next } = await pipelineState.markCompleteAndGetNextSteps(step, {
        ...vars,
        ...outputVars,
        ...newPipelineVars,
      });
      if (isLeaf) {
        console.log('history', pipelineVars.$history);
        // FIXME: Detect if the pipeline is still being run
        // FIXME: Detect if there is already a result
        result = {
          rawPrompt: prompt,
          rawOutput: response,
          output: output,
          latencyMillis: latencyMillis,
          tokenUsage: tokenUsage,
        };
      }
      for (const step of next) {
        taskQueue.enqueue(() => runStep(step, newPipelineVars));
      }
    };

    // Get the starting steps
    const startingSteps = await pipelineState.getStartingSteps(vars);
    if (startingSteps.length === 0) {
      throw new Error('No valid starting steps found');
    }

    yield 'Pipeline started';
    for (const step of startingSteps) {
      taskQueue.enqueue(() => runStep(step, initialPipelineVars));
    }

    await taskQueue.completed();

    if (!result) {
      throw new Error('Pipeline ended without returning a result');
    }

    return result;
  }
}

export interface PipelineStep {
  id: string;
  deps?: string[];
  if?: string | CodeReference;
  outputAs?: string;
}

interface StepDepsStatus {
  steps: Set<string>;
  originalSteps: string[];
  outputs: Set<string>;
  originalOutputs: string[];
}

function createStepDepsStatus(stepIds: string[], outputs: string[]) {
  return {
    steps: new Set(stepIds),
    originalSteps: stepIds,
    outputs: new Set(outputs),
    originalOutputs: outputs,
  };
}

export class PipelineState<T extends PipelineStep> {
  stepIdMap: Map<string, T> = new Map<string, T>();

  stepDepsStatus: Map<string, StepDepsStatus> = new Map<string, StepDepsStatus>();
  stepDepToIds: Map<string, string[]> = new Map<string, string[]>();
  outputDepToIds: Map<string, string[]> = new Map<string, string[]>();

  constructor(steps: T[]) {
    // Register step dependencies
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step.deps) {
        // The first step becomes a starting state, other steps depend on the previous
        const prevStepId = i > 0 ? [`step-${i - 1}`] : [];
        this.stepDepsStatus.set(step.id, createStepDepsStatus(prevStepId, []));
        for (const dep of prevStepId) {
          const ids = this.stepDepToIds.get(dep) ?? [];
          ids.push(step.id);
          this.stepDepToIds.set(dep, ids);
        }
      } else {
        // Register deps as output dependencies
        // FIXME: Validate that all deps exist as outputs
        this.stepDepsStatus.set(step.id, createStepDepsStatus([], step.deps));
        for (const dep of step.deps) {
          const ids = this.outputDepToIds.get(dep) ?? [];
          ids.push(step.id);
          this.outputDepToIds.set(dep, ids);
        }
      }
    }

    this.stepIdMap = new Map<string, T>(steps.map((step) => [step.id, step]));
  }

  async getStartingSteps(latestVars: VarSet): Promise<T[]> {
    // Return any steps that have no dependencies
    const candidates = [...this.stepIdMap.values()].filter((step) => {
      const deps = this.stepDepsStatus.get(step.id);
      if (!deps) {
        throw new Error(`Dependencies for step ${step.id} not found`);
      }
      return deps.steps.size === 0 && deps.outputs.size === 0;
    });

    const availableSteps: T[] = [];
    for (const step of candidates) {
      if (!step.if) {
        availableSteps.push(step);
        continue;
      }

      // Evaluate the if statement
      const code = await toCodeReference(step.if);
      const execute = await code.bind();
      const result = await execute(latestVars);
      if (typeof result !== 'boolean') {
        throw new Error(`Step ${step.id} if statement returned non-boolean`);
      }
      if (result) {
        availableSteps.push(step);
      }
    }

    return availableSteps;
  }

  async markCompleteAndGetNextSteps(
    step: T,
    latestVars: VarSet,
  ): Promise<{ isLeaf: boolean; next: T[] }> {
    const nextSteps: T[] = [];
    let numDeps = 0;

    // Mark any dependencies on this step ID as complete
    this.stepDepToIds.get(step.id)?.forEach((id) => {
      numDeps += 1;
      const stepStatus = this.stepDepsStatus.get(id);
      if (stepStatus?.steps.has(step.id)) {
        stepStatus.steps.delete(step.id);
        if (stepStatus.steps.size === 0 && stepStatus.outputs.size === 0) {
          const step = this.stepIdMap.get(id);
          if (!step) {
            throw new Error(`Step ${id} not found`);
          }
          nextSteps.push(step);
        }
      }
    });

    // Mark any dependencies on this step output as complete
    if (step.outputAs) {
      const outputAs = step.outputAs;
      this.outputDepToIds.get(outputAs)?.forEach((id) => {
        numDeps += 1;
        const stepStatus = this.stepDepsStatus.get(id);
        if (stepStatus?.outputs.has(outputAs)) {
          stepStatus.outputs.delete(outputAs);
          if (stepStatus.steps.size === 0 && stepStatus.outputs.size === 0) {
            const step = this.stepIdMap.get(id);
            if (!step) {
              throw new Error(`Step ${id} not found`);
            }
            nextSteps.push(step);
          }
        }
      });
    }

    // Reset the statuses for any steps
    nextSteps.forEach((step) => {
      const stepStatus = this.stepDepsStatus.get(step.id);
      if (stepStatus) {
        stepStatus.steps = new Set(stepStatus.originalSteps);
        stepStatus.outputs = new Set(stepStatus.originalOutputs);
      }
    });

    // Check that all steps are available with if statements
    const availableSteps: T[] = [];
    for (const step of nextSteps) {
      if (!step.if) {
        availableSteps.push(step);
        continue;
      }

      // Evaluate the if statement
      const code = await toCodeReference(step.if);
      const execute = await code.bind();
      const result = await execute(latestVars);
      if (typeof result !== 'boolean') {
        throw new Error(`Step ${step.id} if statement returned non-boolean`);
      }
      if (result) {
        availableSteps.push(step);
      }
    }

    const isLeaf = numDeps === 0 || (numDeps === nextSteps.length && availableSteps.length === 0);

    return { isLeaf, next: availableSteps };
  }
}
