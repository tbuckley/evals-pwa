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
import { generator } from './generator';
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
    const pipelineState = new PipelineState(this.pipeline.$pipeline, historyMergeFn);
    const initialPipelineVars: PipelineVars = {
      $output: null,
      $history: [],
    };
    const stepCount: Map<string, number> = new Map<string, number>();
    const modelUpdateGenerator = generator<ModelUpdate, TestOutput>();

    // FIXME: Choose a better constant or make it configurable
    const taskQueue = new ParallelTaskQueue(10);
    let result: TestOutput | undefined;
    const history: TestOutput['history'] = [];
    const start = Date.now();

    // FIXME: Can this be removed?
    const outputVars: Record<string, unknown> = {};

    const runStep = async (step: NormalizedPipelineStep, pipelineVars: PipelineVars) => {
      // Generate an ID for the step
      const count = stepCount.get(step.id) ?? 1;
      stepCount.set(step.id, count + 1);
      const stepId = step.id + (count > 1 ? ` #${count}` : '');

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
        // FIXME: If multiple steps share a prompt, use different cache keys
        // FIXME: If re-running a step with the same prompt, use a different cache key?
      };
      const generator = maybeUseCache(this.cache, cacheKey, run);
      let nextRes = await generator.next();
      while (!nextRes.done) {
        const update = nextRes.value;
        if (typeof update === 'string') {
          modelUpdateGenerator.yield({ type: 'append', output: update, internalId: stepId });
        } else {
          modelUpdateGenerator.yield({ ...update, internalId: stepId });
        }
        nextRes = await generator.next();
      }
      const { response, latencyMillis } = nextRes.value;
      const finished = Date.now();

      // Extract the output
      // FIXME: catch any errors extracting output
      const rawOutput = await model.extractOutput(response);
      const output = await modelOutputToTestOutput(rawOutput);
      const tokenUsage = model.extractTokenUsage(response);

      // Add the output to the vars
      const newPipelineVars: PipelineVars = {
        ...pipelineVars,
        $output: output,
        $history: [...pipelineVars.$history, { prompt, output }],
      };
      if (step.outputAs) {
        outputVars[step.outputAs] = output;
      }

      const stepResult: TestOutput = {
        rawPrompt: prompt,
        rawOutput: response,
        output: output,
        latencyMillis: latencyMillis,
        tokenUsage: tokenUsage,
      };
      history.push({ id: stepId, ...stepResult });

      // Mark the step as complete and continue with the next steps
      const { isLeaf, next } = await pipelineState.markCompleteAndGetNextSteps(
        step,
        {
          ...vars,
          ...outputVars,
          ...newPipelineVars,
        },
        newPipelineVars.$history,
      );
      if (isLeaf) {
        // FIXME: Detect if the pipeline is still being run
        // FIXME: Detect if there is already a result
        result = {
          ...stepResult,
          history,
          latencyMillis: finished - start,
          tokenUsage: {
            costDollars: history
              .map((h) => h.tokenUsage?.costDollars)
              .filter((c) => c !== undefined)
              .reduce((a, b) => a + b, 0),
          },
        };
      }
      for (const { step, context } of next) {
        taskQueue.enqueue(() =>
          runStep(step, {
            ...newPipelineVars,
            $history: context,
            $output: context[context.length - 1].output,
          }),
        );
      }
    };

    // Get the starting steps
    const startingSteps = await pipelineState.getStartingSteps(vars, []);
    if (startingSteps.length === 0) {
      throw new Error('No valid starting steps found');
    }

    for (const step of startingSteps) {
      taskQueue.enqueue(() => runStep(step, initialPipelineVars));
    }

    taskQueue
      .completed()
      .then(() => {
        if (!result) {
          throw new Error('Pipeline ended without returning a result');
        }
        modelUpdateGenerator.return(result);
      })
      .catch((error: unknown) => {
        console.error(error);
        modelUpdateGenerator.return({
          rawPrompt: '',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });

    return yield* modelUpdateGenerator.generator;
  }
}

export interface PipelineStep {
  id: string;
  deps?: string[];
  if?: string | CodeReference;
  outputAs?: string;
}

interface StepDepsStatus<S> {
  steps: Map<string, S>;
  originalSteps: string[];
  outputs: Map<string, S>;
  originalOutputs: string[];
}

function createStepDepsStatus<S>(stepIds: string[], outputs: string[]): StepDepsStatus<S> {
  return {
    steps: new Map(),
    originalSteps: stepIds,
    outputs: new Map(),
    originalOutputs: outputs,
  };
}

export class PipelineState<T extends PipelineStep, S> {
  stepIdMap: Map<string, T> = new Map<string, T>();

  stepDepsStatus: Map<string, StepDepsStatus<S>> = new Map<string, StepDepsStatus<S>>();
  stepDepToIds: Map<string, string[]> = new Map<string, string[]>();
  outputDepToIds: Map<string, string[]> = new Map<string, string[]>();

  contextMerge: (a: S, b: S) => S;

  constructor(steps: T[], contextMerge: (a: S, b: S) => S) {
    this.contextMerge = contextMerge;

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

    // FIXME: Validate that all steps have unique IDs
    this.stepIdMap = new Map<string, T>(steps.map((step) => [step.id, step]));
  }

  private getStepsWithNoDeps(): T[] {
    return [...this.stepIdMap.values()].filter((step) => {
      const deps = this.stepDepsStatus.get(step.id);
      if (!deps) {
        throw new Error(`Dependencies for step ${step.id} not found`);
      }
      return (
        deps.steps.size === deps.originalSteps.length &&
        deps.outputs.size === deps.originalOutputs.length
      );
    });
  }

  private async testStep(step: T, vars: VarSet): Promise<boolean> {
    if (!step.if) {
      return true;
    }

    // Evaluate the if statement
    const code = await toCodeReference(step.if);
    const execute = await code.bind();
    const result = await execute(vars);
    if (typeof result !== 'boolean') {
      throw new Error(`Step ${step.id} if statement returned non-boolean`);
    }
    return result;
  }

  private markStepAsComplete(
    stepId: string,
    context: S,
  ): { next: { step: T; context: S }[]; numDeps: number } {
    const next: { step: T; context: S }[] = [];
    let numDeps = 0;
    this.stepDepToIds.get(stepId)?.forEach((id) => {
      numDeps += 1;
      const stepStatus = this.stepDepsStatus.get(id);
      if (!stepStatus) {
        throw new Error(`Dependencies for step ${id} not found`);
      }
      stepStatus.steps.set(stepId, context);
      if (
        stepStatus.steps.size === stepStatus.originalSteps.length &&
        stepStatus.outputs.size === stepStatus.originalOutputs.length
      ) {
        const step = this.stepIdMap.get(id);
        if (!step) {
          throw new Error(`Step ${id} not found`);
        }
        const context = [...stepStatus.steps.values(), ...stepStatus.outputs.values()].reduce(
          this.contextMerge,
        );
        next.push({ step, context });
      }
    });
    return { next, numDeps };
  }

  private markOutputAsComplete(
    outputAs: string,
    context: S,
  ): { next: { step: T; context: S }[]; numDeps: number } {
    const next: { step: T; context: S }[] = [];
    let numDeps = 0;
    this.outputDepToIds.get(outputAs)?.forEach((id) => {
      numDeps += 1;
      const stepStatus = this.stepDepsStatus.get(id);
      if (!stepStatus) {
        throw new Error(`Dependencies for step ${id} not found`);
      }
      stepStatus.outputs.set(outputAs, context);
      if (
        stepStatus.steps.size === stepStatus.originalSteps.length &&
        stepStatus.outputs.size === stepStatus.originalOutputs.length
      ) {
        const step = this.stepIdMap.get(id);
        if (!step) {
          throw new Error(`Step ${id} not found`);
        }
        const context = [...stepStatus.steps.values(), ...stepStatus.outputs.values()].reduce(
          this.contextMerge,
        );
        next.push({ step, context });
      }
    });
    return { next, numDeps };
  }

  async getStartingSteps(latestVars: VarSet, initialContext: S): Promise<T[]> {
    // Include any steps that have no dependencies
    const candidates = this.getStepsWithNoDeps();

    // Include any steps triggered by the initial vars
    for (const varName in latestVars) {
      const res = this.markOutputAsComplete(varName, initialContext);
      candidates.push(...res.next.map(({ step }) => step));
    }

    const validSteps = await Promise.all(
      candidates.map(async (step) => ({
        step,
        valid: await this.testStep(step, latestVars),
      })),
    );
    return validSteps.filter((result) => result.valid).map((result) => result.step);
  }

  async markCompleteAndGetNextSteps(
    step: T,
    latestVars: VarSet,
    context: S,
  ): Promise<{ isLeaf: boolean; next: { step: T; context: S }[] }> {
    const nextSteps: { step: T; context: S }[] = [];
    let numDeps = 0;

    // Mark any dependencies on this step ID as complete
    const res = this.markStepAsComplete(step.id, context);
    nextSteps.push(...res.next);
    numDeps += res.numDeps;

    // Mark any dependencies on this step output as complete
    if (step.outputAs) {
      const res = this.markOutputAsComplete(step.outputAs, context);
      nextSteps.push(...res.next);
      numDeps += res.numDeps;
    }

    // Reset the statuses for any steps
    nextSteps.forEach(({ step }) => {
      const stepStatus = this.stepDepsStatus.get(step.id);
      if (stepStatus) {
        stepStatus.steps = new Map();
        stepStatus.outputs = new Map();
      }
    });

    // Check that all steps are available with if statements
    const nextStepsValid = await Promise.all(
      nextSteps.map(async (step) => ({
        step,
        valid: await this.testStep(step.step, latestVars),
      })),
    );
    const availableSteps = nextStepsValid
      .filter((result) => result.valid)
      .map((result) => result.step);

    const isLeaf = numDeps === 0 || (numDeps === nextSteps.length && availableSteps.length === 0);

    return { isLeaf, next: availableSteps };
  }
}

export function makeOrderedMerge<T>(cmp: (a: T, b: T) => number) {
  return (a: T[], b: T[]) => orderedMerge(a, b, cmp);
}

export function orderedMerge<T>(a: T[], b: T[], cmp: (a: T, b: T) => number): T[] {
  // merge(a, b) == merge(b, a) == merge(a, merge(a, b))
  // ABC + ABD -> ABCD
  // ABCD + ABD -> ABCD

  const merged: T[] = [];

  let ai = 0;
  let bi = 0;
  while (ai < a.length && bi < b.length) {
    const result = cmp(a[ai], b[bi]);
    if (result === 0) {
      // Identical, add just one
      merged.push(a[ai]);
      ai++;
      bi++;
    } else if (result < 0) {
      // a is less than b, add a
      merged.push(a[ai]);
      ai++;
    } else {
      // b is less than a, add b
      merged.push(b[bi]);
      bi++;
    }
  }

  // Add any remaining items
  merged.push(...a.slice(ai));
  merged.push(...b.slice(bi));

  return merged;
}

const historyMergeFn = makeOrderedMerge<HistoryItem>(function (a, b) {
  // First, by prompt length
  if (a.prompt.length < b.prompt.length) {
    return -1;
  } else if (a.prompt.length > b.prompt.length) {
    return 1;
  }

  // Then, by prompt content
  for (let i = 0; i < a.prompt.length; i++) {
    const ap = a.prompt[i];
    const bp = b.prompt[i];
    if (ap.role !== bp.role) {
      return ap.role < bp.role ? -1 : 1;
    }
    if (ap.content.length !== bp.content.length) {
      return ap.content.length < bp.content.length ? -1 : 1;
    }
    for (let j = 0; j < ap.content.length; j++) {
      const ac = ap.content[j];
      const bc = bp.content[j];
      if ('text' in ac && 'file' in bc) {
        return -1;
      } else if ('file' in ac && 'text' in bc) {
        return 1;
      } else if ('file' in ac && 'file' in bc) {
        // TODO: Compare file contents
        if (ac.file.name !== bc.file.name) {
          return ac.file.name < bc.file.name ? -1 : 1;
        }
      } else if ('text' in ac && 'text' in bc) {
        if (ac.text !== bc.text) {
          return ac.text < bc.text ? -1 : 1;
        }
      } else {
        throw new Error('Invalid prompt part');
      }
    }
  }

  // Finally, by output
  if (typeof a.output === 'string' && typeof b.output === 'string') {
    if (a.output !== b.output) {
      return a.output < b.output ? -1 : 1;
    }
  } else if (typeof a.output === 'string' && typeof b.output === 'object') {
    return -1;
  } else if (typeof a.output === 'object' && typeof b.output === 'string') {
    return 1;
  } else if (typeof a.output === 'object' && typeof b.output === 'object') {
    if (a.output.length !== b.output.length) {
      return a.output.length < b.output.length ? -1 : 1;
    }
    for (let i = 0; i < a.output.length; i++) {
      const ao = a.output[i];
      const bo = b.output[i];
      if (typeof ao === 'string' && typeof bo === 'string') {
        return ao < bo ? -1 : 1;
      } else if (typeof ao === 'string' && typeof bo === 'object') {
        return -1;
      } else if (typeof ao === 'object' && typeof bo === 'string') {
        return 1;
      } else if (typeof ao === 'object' && typeof bo === 'object') {
        // Here we can use the file name since FileReference has an absolute path
        if (ao.uri !== bo.uri) {
          return ao.uri < bo.uri ? -1 : 1;
        }
      } else {
        throw new Error('Invalid output part');
      }
    }
  }

  return 0;
});
