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

      console.log('TEST', step, pipelineContext);

      let prompt: ConversationPrompt;
      if (Object.keys(pipelineContext.vars).some((v) => v.startsWith('$call:'))) {
        // We have function call results
        const prevOutput = pipelineContext.history.at(-1)?.output;
        if (!prevOutput || !Array.isArray(prevOutput)) {
          throw new Error('Previous output is not an array');
        }
        const calls = prevOutput.filter((o) => isFunctionCall(o));
        const callResults = step.deps?.filter((d) => d.startsWith('$call:')) ?? [];
        if (calls.length !== callResults.length) {
          throw new Error('Function call results and call dependencies do not match');
        }

        const responses: FunctionResponse[] = [];
        for (let i = 0; i < calls.length; i++) {
          responses.push({
            type: 'function-response',
            call: calls[i].name,
            response: { result: pipelineContext.vars[callResults[i]] as unknown }, // FIXME: don't wrap
          });
        }

        console.log('responses', responses);
        prompt = [{ role: 'user', content: responses }];
      } else {
        // Render the prompt
        const promptFormatter = new HandlebarsPromptFormatter(step.prompt);
        prompt = await promptFormatter.format(
          {
            ...vars,
            ...pipelineContext.vars,
            $history: pipelineContext.history,
            $output: pipelineContext.history[pipelineContext.history.length - 1]?.output ?? null,
          },
          model.mimeTypes,
        );
      }

      // BEGIN optional prompt

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

      // END optional prompt

      // Do not mark as completed, it will be delegated by a virtual step
      let delegateMarkCompleteToDependency: string | null = null;

      if (
        Array.isArray(output) &&
        output.some((part) => isFunctionCall(part)) &&
        step.session !== undefined
      ) {
        // FIXME: use nanoid for shorter UUIDs
        const uuid = crypto.randomUUID();

        delegateMarkCompleteToDependency = `$env:${step.id}-${uuid}`;

        const functionCalls = output.filter((part) => isFunctionCall(part));
        const virtualOutputs = functionCalls.map(
          (part, index) => `$call:${step.id}-fn-${index}-${part.name}-${uuid}`,
        );

        // Create a step spoofing this step that runs when all functions are complete
        pipelineState.registerStep(
          {
            // FIXME: remove any previously appended IDs
            id: `${step.id}:complete-${uuid}`,
            deps: [...virtualOutputs, delegateMarkCompleteToDependency],
            prompt: '', // FIXME: Make prompt optional

            // Inherit any model + post-prompt settings the original step
            providerLabel: step.providerLabel,
            session: step.session,
            outputAs: step.outputAs,
          },
          step.id,
        );

        // Run function calls
        await Promise.all(
          functionCalls.map(async (part, index) => {
            const virtualOutput = virtualOutputs[index];
            const { next } = await pipelineState.markCompleteAndGetNextSteps(
              {
                id: `${step.id}-function-call`,
                outputAs: `$fn:${part.name}`, // Must match dependency for function call
                prompt: '',
              },
              { ...vars, $args: part.args }, // Pass $args to the function call step
              {
                ...pipelineContext,
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
            taskQueue.enqueue(() => safeRunStep(next[0].step, next[0].context));
          }),
        );
      }

      // Add the output to the vars
      // Use step.id for this history since it is only used for prompts/if
      const newHistory = [...pipelineContext.history, { id: step.id, prompt, output }];
      const newVars = { ...pipelineContext.vars };
      if (step.outputAs && !delegateMarkCompleteToDependency) {
        newVars[step.outputAs] = output;
      }
      stripFunctionCallResults(newVars);

      const stepResult: TestOutput = {
        rawPrompt: prompt,
        rawOutput: response,
        output: output,
        latencyMillis: latencyMillis,
        tokenUsage: tokenUsage,
      };
      history.push({ id: stepId, ...stepResult });

      if (delegateMarkCompleteToDependency) {
        // We're done, delegate to the dependency
        const { next } = await pipelineState.markCompleteAndGetNextSteps(
          {
            id: delegateMarkCompleteToDependency,
            prompt: '', // FIXME: Make prompt optional
            outputAs: delegateMarkCompleteToDependency,
          },
          {
            ...vars,
            ...newVars,
            $history: newHistory,
            $output: newHistory[newHistory.length - 1]?.output ?? null,
          },
          {
            ...pipelineContext,
            history: newHistory,
            vars: newVars,
          },
        );
        for (const { step, context } of next) {
          taskQueue.enqueue(() => safeRunStep(step, context));
        }
        return;
      }

      // Mark the step as complete and continue with the next steps
      const { isLeaf, next } = await pipelineState.markCompleteAndGetNextSteps(
        step,
        {
          ...vars,
          ...newVars,
          $history: newHistory,
          $output: newHistory[newHistory.length - 1]?.output ?? null,
        },
        {
          history: newHistory,
          vars: newVars,
          virtualOutputs: pipelineContext.virtualOutputs,
        },
      );
      if (isLeaf && pipelineContext.virtualOutputs.length > 0) {
        // This is the end of the virtual step, mark the virtual outputs as complete
        const nextSteps: { step: NormalizedPipelineStep; context: PipelineContext }[] = [];
        for (const virtualOutput of pipelineContext.virtualOutputs) {
          const res = await pipelineState.markCompleteAndGetNextSteps(
            { ...step, outputAs: virtualOutput },
            {
              // Only pass the virtual output, no other vars
              [virtualOutput]: newHistory[newHistory.length - 1]?.output ?? null,
            },
            {
              history: [], // Don't pass the history, preserve the original step's context
              vars: {
                // Only pass the virtual output, no other vars
                [virtualOutput]: newHistory[newHistory.length - 1]?.output ?? null,
              },
              virtualOutputs: [], // Reset virtual outputs
            },
          );
          nextSteps.push(...res.next);
        }
        for (const { step, context } of nextSteps) {
          console.log('enqueueing step', step.id);
          taskQueue.enqueue(() => safeRunStep(step, context));
        }
        return;
      }
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
