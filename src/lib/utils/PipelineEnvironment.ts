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
  ModelSession,
  ProviderOutputPart,
  FunctionCall,
  FunctionResponse,
} from '$lib/types';
import { maybeUseCache, modelOutputToTestOutput } from './environmentHelpers';
import { generator } from './generator';
import { HandlebarsPromptFormatter } from './HandlebarsPromptFormatter';
import { makeOrderedMerge } from './orderedMerge';
import { ParallelTaskQueue } from './ParallelTaskQueue';
import { PipelineState } from './PipelineState';

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
interface SessionState {
  session: ModelSession;
  provider: ModelProvider;
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

    const sessionManager = new Map<string, SessionState>();

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

      // Generate the prompt
      let prompt: ConversationPrompt;
      const functionResponses = getFunctionResponses(pipelineContext, step.deps ?? []);
      if (functionResponses) {
        prompt = [{ role: 'user', content: functionResponses }];
      } else {
        prompt = await renderPrompt(
          step.prompt,
          generatePipelineVars(vars, pipelineContext),
          model.mimeTypes,
        );
      }

      // Run the prompt (or read from cache)
      const session = step.session ? sessionManager.get(step.session) : undefined;
      const sessionId = step.session;
      const { output, tokenUsage, latencyMillis, finished, response, errorResult } = await runModel(
        model,
        prompt,
        this.cache,
        session,
        sessionId ? (value: SessionState) => sessionManager.set(sessionId, value) : undefined,
        context,
        count,
        (value: ModelUpdate) => {
          modelUpdateGenerator.yield({ ...value, internalId: stepId });
        },
      );
      if (errorResult) {
        history.push({ id: stepId, ...errorResult });
        result = errorResult;
        return;
      }

      // Do not mark as completed, it will be delegated by a virtual step
      let delegateMarkCompleteToDependency: string | null = null;

      const functionCalls = getFunctionCalls(output);
      if (functionCalls.length > 0 && step.session !== undefined) {
        // Create a unique suffix for virtual steps
        // TODO: consider nanoid for shorter UUIDs
        const suffix = crypto.randomUUID();

        // Share the current pipeline context
        const ctxDependency = `$ctx:${step.id}-${suffix}`;
        delegateMarkCompleteToDependency = ctxDependency;

        // Create virtual outputs for each function call
        const virtualOutputs = generateFunctionCallVirtualOutputs(step, suffix, functionCalls);

        // Create a step spoofing this step that runs when all functions are complete
        registerCompletionStep(
          pipelineState,
          step,
          [...virtualOutputs, delegateMarkCompleteToDependency],
          suffix,
        );

        // Run function calls
        await Promise.all(
          functionCalls.map(async (part, index) => {
            const virtualOutput = virtualOutputs[index];
            const next = await generateVirtualFunctionCall(
              pipelineState,
              part,
              virtualOutput,
              vars,
              pipelineContext,
            );
            taskQueue.enqueue(() => safeRunStep(next.step, next.context));
          }),
        );
      }

      // Add the output to the vars, and remove any virtual vars
      // Use step.id for this history since it is only used for prompts/if
      const newHistory = [...pipelineContext.history, { id: step.id, prompt, output }];
      const newPipelineVars = { ...pipelineContext.vars };
      if (step.outputAs && !delegateMarkCompleteToDependency) {
        newPipelineVars[step.outputAs] = output;
      }
      stripFunctionCallResults(newPipelineVars);

      // Save the step's result to history
      const stepResult: TestOutput = {
        rawPrompt: prompt,
        rawOutput: response,
        output: output,
        latencyMillis: latencyMillis,
        tokenUsage: tokenUsage,
      };
      history.push({ id: stepId, ...stepResult });

      const { next, isLeaf } = await getNextSteps(
        pipelineState,
        step,
        delegateMarkCompleteToDependency,
        {
          ...vars,
          ...newPipelineVars,
          $history: newHistory,
          $output: newHistory.at(-1)?.output ?? null,
        },

        {
          ...pipelineContext,
          history: newHistory,
          vars: newPipelineVars,
        },
      );

      if (next.length > 0) {
        // Run the next steps
        for (const { step, context } of next) {
          console.log('enqueueing step', step.id);
          taskQueue.enqueue(() => safeRunStep(step, context));
        }
      } else if (isLeaf) {
        // This was a leaf node, so assume we're done
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

        // Save the output as the final result
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
      // Otherwise it's not a leaf node but its dependencies require other steps to finish
      // Do nothing
    };

    // Get the starting steps
    const startingSteps = await pipelineState.getStartingSteps(
      { ...vars, $history: [], $output: null },
      { history: [], vars: {}, virtualOutputs: [] },
    );
    if (startingSteps.length === 0) {
      throw new Error('No valid starting steps found');
    }

    for (const step of startingSteps) {
      taskQueue.enqueue(() => safeRunStep(step, { history: [], vars: {}, virtualOutputs: [] }));
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
  virtualOutputs: string[]; // Virtual steps to mark as complete when the pipeline ends
}
function mergePipelineContext(a: PipelineContext, b: PipelineContext): PipelineContext {
  return {
    history: historyMergeFn(a.history, b.history),
    vars: { ...a.vars, ...b.vars },
    virtualOutputs: [...a.virtualOutputs, ...b.virtualOutputs],
  };
}

function isFunctionCall(part: ProviderOutputPart): part is FunctionCall {
  return typeof part === 'object' && 'type' in part && part.type === 'function-call';
}

function stripFunctionCallResults(vars: VarSet) {
  for (const key of Object.keys(vars)) {
    if (key.startsWith('$call:')) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete vars[key];
    }
  }
  return vars;
}

async function runModel(
  model: ModelProvider,
  prompt: ConversationPrompt,
  cache: ModelCache | undefined,
  session: SessionState | undefined,
  setSession: ((value: SessionState) => void) | undefined,
  context: RunContext,
  count: number,
  yieldUpdate: (value: ModelUpdate) => void,
) {
  const { request, runModel } = await model.run(prompt, {
    ...context,
    session: session?.provider === model ? session.session : undefined,
  });
  const cacheKey = {
    provider: model.id,
    request,
    ...(context.cacheKey ?? {}),
    // If re-running a step with the same prompt, use a different cache key?
    ...(count > 1 ? { pipelineCount: count } : {}),
    // TODO: If multiple steps share a prompt, use different cache keys
  };
  const generator = maybeUseCache(cache, cacheKey, runModel, model.requestSemaphore, {
    requireSession: !session,
  });
  let nextRes = await generator.next();
  while (!nextRes.done) {
    const update = nextRes.value;
    if (typeof update === 'string') {
      yieldUpdate({ type: 'append', output: update });
    } else if (update.type !== 'begin-stream') {
      yieldUpdate(update);
    }
    nextRes = await generator.next();
  }
  const { response, latencyMillis, session: resSession } = nextRes.value;
  const finished = Date.now();

  if (setSession) {
    if (!resSession) {
      throw new Error('Provider does not support sessions');
    }
    setSession({ session: resSession, provider: model });
  } else {
    await resSession?.close?.();
  }

  try {
    // Extract the output
    const rawOutput = await model.extractOutput(response);
    const output = await modelOutputToTestOutput(rawOutput);
    const tokenUsage = model.extractTokenUsage(response);

    // Immediately yield the final output
    if (typeof output === 'string') {
      yieldUpdate({ type: 'replace', output });
    } else {
      yieldUpdate({ type: 'replace', output: '' });
      for (const part of output) {
        yieldUpdate({ type: 'append', output: part });
      }
    }

    return { output, tokenUsage, latencyMillis, finished, response };
  } catch (e) {
    if (e instanceof Error) {
      return {
        errorResult: {
          rawPrompt: prompt,
          rawOutput: response,
          error: e.toString(),
          latencyMillis,
        },
      };
    }
    throw e;
  }
}

function getFunctionCalls(output: NonNullable<TestResult['output']>): FunctionCall[] {
  if (typeof output === 'string') {
    return [];
  }
  return output.filter((o) => isFunctionCall(o));
}

function getFunctionResponses(context: PipelineContext, deps: string[]): FunctionResponse[] | null {
  if (!Object.keys(context.vars).some((v) => v.startsWith('$call:'))) {
    return null;
  }

  // Get the calls from the previous output
  const prevOutput = context.history.at(-1)?.output;
  if (!prevOutput || !Array.isArray(prevOutput)) {
    throw new Error('Received function responses, but previous output is not an array');
  }
  const calls = prevOutput.filter((o) => isFunctionCall(o));

  // Get the corresponding results
  const callResults = deps.filter((d) => d.startsWith('$call:'));
  if (calls.length !== callResults.length) {
    throw new Error('Function call results and call dependencies do not match');
  }

  // Create the responses
  const responses: FunctionResponse[] = [];
  for (let i = 0; i < calls.length; i++) {
    responses.push({
      type: 'function-response',
      call: calls[i].name,
      response: { result: context.vars[callResults[i]] as unknown }, // FIXME: don't wrap
    });
  }

  return responses;
}

function renderPrompt(prompt: string, vars: VarSet, mimeTypes?: string[]) {
  const promptFormatter = new HandlebarsPromptFormatter(prompt);
  return promptFormatter.format(vars, mimeTypes);
}

function generatePipelineVars(vars: VarSet, pipelineContext: PipelineContext) {
  return {
    ...vars,
    ...pipelineContext.vars,
    $history: pipelineContext.history,
    $output: pipelineContext.history.at(-1)?.output ?? null,
  };
}

function generateFunctionCallVirtualOutputs(
  step: NormalizedPipelineStep,
  uuid: string,
  calls: FunctionCall[],
): string[] {
  return calls.map((part, index) => `$call:${step.id}-fn-${index}-${part.name}-${uuid}`);
}

async function generateVirtualFunctionCall(
  pipelineState: PipelineState<NormalizedPipelineStep, PipelineContext>,
  part: FunctionCall,
  virtualOutput: string,
  globalVars: VarSet,
  pipelineContext: PipelineContext,
) {
  const { next } = await pipelineState.markCompleteAndGetNextSteps(
    {
      id: virtualOutput, // Doesn't really matter, just should not match a real step ID
      outputAs: `$fn:${part.name}`, // Must match dependency for function call
      prompt: '',
    },
    // Pass global vars + $args for if-testing
    // Skip pipeline vars, since functions should focus on their arguments
    { ...globalVars, $args: part.args },
    {
      ...pipelineContext,
      // Pass the current pipeline vars + $args
      // FIXME: should we not pass pipelineContext vars here? Align with above
      vars: stripFunctionCallResults({ ...pipelineContext.vars, $args: part.args }),
      virtualOutputs: [virtualOutput],
    },
  );
  if (next.length === 0) {
    throw new Error(`no step found for function call ${part.name}`);
  }
  if (next.length > 1) {
    throw new Error(`multiple steps found for function call ${part.name}`);
  }
  return next[0];
}

function registerCompletionStep(
  pipelineState: PipelineState<NormalizedPipelineStep, PipelineContext>,
  step: NormalizedPipelineStep,
  deps: string[],
  uuid: string,
) {
  // Remove any previously appended IDs
  const prefix = step.id.split(':')[0];
  const id = `${prefix}:complete-${uuid}`;
  pipelineState.registerStep(
    {
      id,
      deps,
      prompt: '', // FIXME: Make prompt optional

      // Inherit any model + post-prompt settings the original step
      providerLabel: step.providerLabel,
      session: step.session,
      outputAs: step.outputAs,
    },
    step.id,
  );
}

async function getNextSteps(
  pipelineState: PipelineState<NormalizedPipelineStep, PipelineContext>,
  step: NormalizedPipelineStep,
  delegateMarkCompleteToDependency: string | null,
  vars: VarSet,
  pipelineContext: PipelineContext,
) {
  // If we should delegate step completion to a dependency, just pass our current context
  if (delegateMarkCompleteToDependency) {
    const { next } = await pipelineState.markCompleteAndGetNextSteps(
      {
        id: delegateMarkCompleteToDependency,
        prompt: '', // FIXME: Make prompt optional
        outputAs: delegateMarkCompleteToDependency,
      },
      vars,
      pipelineContext,
    );
    return { next, isLeaf: false }; // isLeaf must be false since there's a dependency
  }

  // Otherwise, mark the step as complete and continue with the next steps
  const { isLeaf, next } = await pipelineState.markCompleteAndGetNextSteps(
    step,
    vars,
    pipelineContext,
  );

  // If it's not a leaf node, return the next steps
  if (!isLeaf) {
    return { next, isLeaf };
  }

  // If it's a leaf and there are virtual outputs, mark the virtual outputs as complete
  if (pipelineContext.virtualOutputs.length > 0) {
    const output = pipelineContext.history.at(-1)?.output;
    const nextSteps: { step: NormalizedPipelineStep; context: PipelineContext }[] = [];
    for (const virtualOutput of pipelineContext.virtualOutputs) {
      const res = await pipelineState.markCompleteAndGetNextSteps(
        { ...step, outputAs: virtualOutput },
        {
          // Only pass the virtual output, no other vars
          [virtualOutput]: output ?? null,
        },
        {
          history: [], // Don't pass the history, preserve the original step's context
          vars: {
            // Only pass the virtual output, no other vars
            [virtualOutput]: output ?? null,
          },
          virtualOutputs: [], // Reset virtual outputs
        },
      );
      nextSteps.push(...res.next);
    }
    return { next: nextSteps, isLeaf: false }; // TODO: merge isLeaf values?
  }

  // Otherwise it's a normal leaf node, pass it on
  return { next, isLeaf };
}
