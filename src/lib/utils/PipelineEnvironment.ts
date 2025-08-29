import { CodeReference, toCodeReference } from '$lib/storage/CodeReference';
import { FileReference } from '$lib/storage/FileReference';
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
  TokenUsage,
  ModelSession,
  ProviderOutputPart,
  FunctionCall,
} from '$lib/types';
import { maybeUseCache, modelOutputToTestOutput } from './environmentHelpers';
import { generator } from './generator';
import { HandlebarsPromptFormatter } from './HandlebarsPromptFormatter';
import { ParallelTaskQueue } from './ParallelTaskQueue';

export interface ModelConfig {
  default: ModelProvider | null;
  labeled?: Record<string, ModelProvider>;
}

export interface Config {
  models: ModelConfig;
  pipeline: NormalizedPipelinePrompt;
  cache?: ModelCache;
}

export interface HistoryItem {
  id: string;
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
    const provider: TestEnvironment['provider'] = {
      id: this.models.default?.id ?? null,
    };
    if (this.models.labeled) {
      provider.labeled = Object.fromEntries(
        Object.entries(this.models.labeled).map(([label, provider]) => [
          label,
          { id: provider.id },
        ]),
      );
    }
    return provider;
  }
  get prompt() {
    return this.pipeline;
  }

  async *run(
    vars: VarSet,
    context: RunContext,
  ): AsyncGenerator<string | ModelUpdate, TestOutput, void> {
    const pipelineState = new PipelineState(this.pipeline.$pipeline, mergePipelineContext);
    const stepRunCount: Map<string, number> = new Map<string, number>(); // Track how many times each step has been run
    const modelUpdateGenerator = generator<ModelUpdate, TestOutput>();

    // TODO: Rate limit at provider level
    const taskQueue = new ParallelTaskQueue(6);
    let result: TestOutput | undefined;
    const history: TestOutput['history'] = []; // NOTE: IDs must be unique for display
    const start = Date.now();

    const sessionManager = new Map<string, { session: ModelSession; provider: ModelProvider }>();

    const safeRunStep = async (step: NormalizedPipelineStep, pipelineContext: PipelineContext) => {
      const count = stepRunCount.get(step.id) ?? 1;
      const stepId = step.id + (count > 1 ? ` #${count}` : '');

      try {
        await runStep(step, pipelineContext);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error running step:', error);
        result = {
          error: errorMessage,
          history: [...history, { id: stepId, error: errorMessage }],
        };
        taskQueue.abort();
      }
    };

    const runStep = async (step: NormalizedPipelineStep, pipelineContext: PipelineContext) => {
      // Generate an ID for the step
      const count = stepRunCount.get(step.id) ?? 1;
      stepRunCount.set(step.id, count + 1);
      const stepId = step.id + (count > 1 ? ` #${count}` : '');

      const model = step.providerLabel
        ? this.models.labeled?.[step.providerLabel]
        : this.models.default;
      if (!model) {
        throw new Error(`Model for step ${step.id} not found`);
      }

      // Render the prompt
      const promptFormatter = new HandlebarsPromptFormatter(step.prompt);
      const prompt = await promptFormatter.format(
        {
          ...vars,
          ...pipelineContext.vars,
          $history: pipelineContext.history,
          $output: pipelineContext.history[pipelineContext.history.length - 1]?.output ?? null,
        },
        model.mimeTypes,
      );

      // Run the prompt (or read from cache)
      const existingSession = step.session ? sessionManager.get(step.session) : undefined;
      const { request, runModel } = await model.run(prompt, {
        ...context,
        session: existingSession?.provider === model ? existingSession.session : undefined,
      });
      const cacheKey = {
        provider: model.id,
        request,
        ...(context.cacheKey ?? {}),
        // If re-running a step with the same prompt, use a different cache key?
        ...(count > 1 ? { pipelineCount: count } : {}),
        // TODO: If multiple steps share a prompt, use different cache keys
      };
      const generator = maybeUseCache(this.cache, cacheKey, runModel, model.requestSemaphore, {
        requireSession: step.session !== undefined,
      });
      let nextRes = await generator.next();
      while (!nextRes.done) {
        const update = nextRes.value;
        if (typeof update === 'string') {
          modelUpdateGenerator.yield({ type: 'append', output: update, internalId: stepId });
        } else if (update.type !== 'begin-stream') {
          modelUpdateGenerator.yield({ ...update, internalId: stepId });
        }
        nextRes = await generator.next();
      }
      const { response, latencyMillis, session } = nextRes.value;
      const finished = Date.now();

      if (step.session) {
        if (!session) {
          throw new Error('Provider does not support sessions');
        }
        sessionManager.set(step.session, { session, provider: model });
      } else {
        await session?.close?.();
      }

      // Extract the output
      let output: NonNullable<TestOutput['output']>;
      let tokenUsage: TokenUsage;
      try {
        const rawOutput = await model.extractOutput(response);
        output = await modelOutputToTestOutput(rawOutput);
        tokenUsage = model.extractTokenUsage(response);

        // Immediately yield the final output
        if (typeof output === 'string') {
          modelUpdateGenerator.yield({ type: 'replace', output, internalId: stepId });
        } else {
          modelUpdateGenerator.yield({ type: 'replace', output: '', internalId: stepId });
          for (const part of output) {
            modelUpdateGenerator.yield({ type: 'append', output: part, internalId: stepId });
          }
        }
      } catch (e) {
        if (e instanceof Error) {
          result = {
            rawPrompt: prompt,
            rawOutput: response,
            error: e.toString(),
            latencyMillis,
          };
          history.push({ id: stepId, ...result });
          return;
        }
        throw e;
      }

      if (Array.isArray(output) && output.some((part) => isFunctionCall(part))) {
        const functionCalls = output.filter((part) => isFunctionCall(part));

        // Run function calls
        await Promise.all(
          functionCalls.map(async (part) => {
            const { next } = await pipelineState.markCompleteAndGetNextSteps(
              {
                id: `${step.id}-function-call`,
                outputAs: `$fn:${part.name}`,
                prompt: '',
              },
              { ...vars, $args: part.args },
              pipelineContext,
            );
            if (next.length === 0) {
              throw new Error(`no step found for function call ${part.name}`);
            }
            if (next.length > 1) {
              throw new Error(`multiple steps found for function call ${part.name}`);
            }
            taskQueue.enqueue(() => safeRunStep(next[0].step, next[0].context));
          }),
        );
      }

      // Add the output to the vars
      // Use step.id for this history since it is only used for prompts/if
      const newHistory = [...pipelineContext.history, { id: step.id, prompt, output }];
      const newVars = { ...pipelineContext.vars };
      if (step.outputAs) {
        newVars[step.outputAs] = output;
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
          ...newVars,
          $history: newHistory,
          $output: newHistory[newHistory.length - 1]?.output ?? null,
        },
        { history: newHistory, vars: newVars },
      );
      if (isLeaf) {
        // If this isn't the first result, return an error instead
        if (result !== undefined) {
          if (!result.error) {
            result = {
              error: 'Pipeline produced multiple results',
            };
            taskQueue.abort();
          }
          return;
        }

        // If this isn't the last task, return an error instead
        if (taskQueue.remaining() !== 1) {
          result = {
            error: 'Pipeline produced a result while still running',
          };
          taskQueue.abort();
          return;
        }

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
        console.log('enqueueing step', step.id);
        taskQueue.enqueue(() => safeRunStep(step, context));
      }
    };

    // Get the starting steps
    const startingSteps = await pipelineState.getStartingSteps(
      { ...vars, $history: [], $output: null },
      { history: [], vars: {} },
    );
    if (startingSteps.length === 0) {
      throw new Error('No valid starting steps found');
    }

    for (const step of startingSteps) {
      taskQueue.enqueue(() => safeRunStep(step, { history: [], vars: {} }));
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
        if (result?.error) {
          // If we already have an error, return it
          modelUpdateGenerator.return(result);
        } else {
          // Otherwise, return an error
          modelUpdateGenerator.return({
            rawPrompt: '',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      })
      .finally(() => {
        const sessions = [...sessionManager.values()];
        Promise.all(sessions.map((s) => s.session.close?.())).catch((e: unknown) => {
          console.error('Error closing pipeline sessions:', e);
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
  spoofStepIdMap: Map<string, string> = new Map<string, string>();

  contextMerge: (a: S, b: S) => S;

  constructor(steps: T[], contextMerge: (a: S, b: S) => S) {
    this.contextMerge = contextMerge;

    // Register step dependencies
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step.deps) {
        // The first step becomes a starting state, other steps depend on the previous
        const prevStepId = i > 0 ? [steps[i - 1].id] : [];
        this.stepDepsStatus.set(step.id, createStepDepsStatus(prevStepId, []));
        for (const dep of prevStepId) {
          const ids = this.stepDepToIds.get(dep) ?? [];
          ids.push(step.id);
          this.stepDepToIds.set(dep, ids);
        }
      } else {
        // Register deps as output dependencies
        this.stepDepsStatus.set(step.id, createStepDepsStatus([], step.deps));
        for (const dep of step.deps) {
          const ids = this.outputDepToIds.get(dep) ?? [];
          ids.push(step.id);
          this.outputDepToIds.set(dep, ids);
        }
      }
    }

    // Validate that all steps have unique IDs
    const uniqueIds = new Set(steps.map((step) => step.id));
    if (uniqueIds.size !== steps.length) {
      throw new Error('Steps have duplicate IDs');
    }

    this.stepIdMap = new Map<string, T>(steps.map((step) => [step.id, step]));
  }

  registerStep(step: T, spoofStepId?: string) {
    if (this.stepIdMap.has(step.id)) {
      throw new Error(`Step ${step.id} already registered`);
    }
    this.stepIdMap.set(step.id, step);

    if (!step.deps) {
      throw new Error('Cannot late-register a step with no dependencies');
    }

    if (spoofStepId) {
      if (!this.stepIdMap.has(spoofStepId)) {
        throw new Error(`Spoofed step ${spoofStepId} not found`);
      }
      this.spoofStepIdMap.set(step.id, spoofStepId);
    }

    this.stepDepsStatus.set(step.id, createStepDepsStatus([], step.deps));
    for (const dep of step.deps) {
      const ids = this.outputDepToIds.get(dep) ?? [];
      ids.push(step.id);
      this.outputDepToIds.set(dep, ids);
    }
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

    const spoofedStepId = this.spoofStepIdMap.get(step.id);
    if (spoofedStepId) {
      const spoofedStep = this.stepIdMap.get(spoofedStepId);
      if (!spoofedStep) {
        throw new Error(`Spoofed step ${spoofedStepId} not found when marking step as complete`);
      }
      step = spoofedStep;
    }

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

// This just needs some way to consistently compare history items, or return 0 if identical
// All properties should be tested
// TODO consider using a JSON hash?
const historyMergeFn = makeOrderedMerge<HistoryItem>(function (a, b) {
  // By step ID
  if (a.id < b.id) {
    return -1;
  } else if (a.id > b.id) {
    return 1;
  }

  // Then, by prompt length
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
      } else if (ao instanceof FileReference && bo instanceof FileReference) {
        // Here we can use the file name since FileReference has an absolute path
        if (ao.uri !== bo.uri) {
          return ao.uri < bo.uri ? -1 : 1;
        }
      } else if (typeof ao === 'object' && typeof bo === 'object') {
        const ja = JSON.stringify(ao);
        const jb = JSON.stringify(bo);
        if (ja !== jb) {
          return ja < jb ? -1 : 1;
        }
      } else {
        throw new Error('Invalid output part');
      }
    }
  }

  return 0;
});

interface PipelineContext {
  history: HistoryItem[];
  vars: VarSet;
}
function mergePipelineContext(a: PipelineContext, b: PipelineContext): PipelineContext {
  return {
    history: historyMergeFn(a.history, b.history),
    vars: { ...a.vars, ...b.vars },
  };
}

function isFunctionCall(part: ProviderOutputPart): part is FunctionCall {
  return typeof part === 'object' && 'type' in part && part.type === 'function-call';
}
