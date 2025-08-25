import type { Readable } from 'svelte/store';
import { z } from 'zod';
import { FileReference } from './storage/FileReference';
import { CodeReference } from './storage/CodeReference';
import type { Semaphore } from './utils/semaphore';

const varSchema = z.any();

const varSetSchema = z.record(z.string(), varSchema);

const assertionSchema = z.object({
  // Required
  type: z.string(),

  // Optional
  description: z.string().optional(),
  vars: z.record(z.string(), z.unknown()).optional(),
  id: z.string().optional(),
});
export const normalizedProviderConfigSchema = z.object({
  mimeTypes: z.array(z.string()).optional(),
});
export type NormalizedProviderConfig = z.infer<typeof normalizedProviderConfigSchema>;
const normalizedProviderSchema = z.object({
  id: z.string(),
  labels: z.array(z.string()).optional(),
  config: normalizedProviderConfigSchema.passthrough().optional(),
  prompts: z.array(z.string()).optional(),
});
export const providerSchema = z.union([z.string(), normalizedProviderSchema]);

export interface NormalizedPipelineStep {
  id: string;
  prompt: string;
  outputAs?: string;
  if?: string | CodeReference;
  deps?: string[];
  providerLabel?: string;
  session?: string;
}
export interface NormalizedPipelinePrompt {
  $pipeline: NormalizedPipelineStep[];
}
const simplePromptSchema = z.string();
const objectPromptSchema = z.object({
  prompt: z.string(),
  providerLabel: z.string().optional(),
});
export const pipelinePromptSchema = z.object({
  $pipeline: z.array(
    z.union([
      z.string(),
      z.object({
        id: z.string().optional(),
        prompt: z.string(),
        providerLabel: z.string().optional(),
        outputAs: z.string().optional(),
        if: z.union([z.string(), z.instanceof(CodeReference)]).optional(),
        deps: z.array(z.string()).optional(),
      }),
    ]),
  ),
});
const promptSchema = z.union([simplePromptSchema, objectPromptSchema, pipelinePromptSchema]);

export const globalOptionsSchema = z.object({
  maxConcurrency: z.number().int().positive().optional(),
});
export type GlobalOptions = z.infer<typeof globalOptionsSchema>;

export type PipelinePrompt = z.infer<typeof pipelinePromptSchema>;
export type Var = z.infer<typeof varSchema>;
export type VarSet = z.infer<typeof varSetSchema>;
export type Assertion = z.infer<typeof assertionSchema>;
export type NormalizedProvider = z.infer<typeof normalizedProviderSchema>;
export type Provider = z.infer<typeof providerSchema>;
export type NormalizedPrompt =
  | string
  | { prompt: string; providerLabel?: string }
  | NormalizedPipelinePrompt;
export type NormalizedAssertion = Assertion & Required<Pick<Assertion, 'vars'>>;

export interface NormalizedTestCase {
  description?: string;
  vars: VarSet;
  assert: NormalizedAssertion[];
  only?: boolean;
  repeat?: number;
  cacheKey?: Record<string, unknown>; // Used for resetting the cache
}

export interface NormalizedConfig {
  description?: string;
  providers: NormalizedProvider[];
  prompts: NormalizedPrompt[];
  tests: NormalizedTestCase[];
  options?: GlobalOptions;
}

// Output

export const assertionResultSchema = z.object({
  // Required
  pass: z.boolean(),

  // Optional
  message: z.string().optional(),
  visuals: z.array(z.union([z.string(), z.instanceof(FileReference)])).optional(),
  outputs: z.record(z.string(), z.union([z.boolean(), z.number()])).optional(),
  id: z.string().optional(),
});
export type AssertionResult = z.infer<typeof assertionResultSchema>;

const tokenUsageSchema = z.object({
  // Optional
  inputTokens: z.number().int().optional(),
  outputTokens: z.number().int().optional(),
  totalTokens: z.number().int().optional(),
  costDollars: z.number().optional(),
});
export type TokenUsage = z.infer<typeof tokenUsageSchema>;

const metaProviderOutputPartSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('meta'), message: z.string(), data: z.unknown().optional() }),
  // z.object({ type: z.literal('text'), text: z.string() }),
]);
export type MetaProviderOutputPart = z.infer<typeof metaProviderOutputPartSchema>;
const providerOutputPartSchema = z.union([
  z.string(),
  z.instanceof(FileReference),
  metaProviderOutputPartSchema,
]);
export type ProviderOutputPart = z.infer<typeof providerOutputPartSchema>;
const providerOutputSchema = z.union([z.string(), z.array(providerOutputPartSchema)]);
export type ProviderOutput = z.infer<typeof providerOutputSchema>;
export type ExtractedOutputPart = string | Blob | MetaProviderOutputPart;

const baseTestOutputSchema = z.object({
  // Required
  rawPrompt: z.unknown(),

  // Success
  rawOutput: z.unknown().optional(),
  output: providerOutputSchema.optional(),
  latencyMillis: z.number().optional(),
  tokenUsage: tokenUsageSchema.optional(),

  // Error
  error: z.string().optional(),
});

const testOutputSchema = baseTestOutputSchema.extend({
  history: z.array(baseTestOutputSchema.extend({ id: z.string() })).optional(),
});
export type TestOutput = z.infer<typeof testOutputSchema>;

const testResultSchema = testOutputSchema.extend({
  // Required
  pass: z.boolean(),
  assertionResults: z.array(assertionResultSchema),
});
export type TestResult = z.infer<typeof testResultSchema>;

const testCaseSchema = z.object({
  // Optional
  vars: varSetSchema.optional(),
  description: z.string().optional(),
  assert: z.array(assertionSchema).optional(),
  only: z.boolean().optional(),
  repeat: z.number().int().positive().optional(),
  cacheKey: z.record(z.string(), z.unknown()).optional(),
});
export type TestCase = z.infer<typeof testCaseSchema>;

export const envSchema = z.object({
  provider: providerSchema.nullable(),
  labeledProviders: z.record(z.string(), providerSchema).optional(),
  prompt: promptSchema,
});
export type Env = z.infer<typeof envSchema>;

export const runSchema = z.object({
  version: z.literal(1),

  // Required
  id: z.string(),
  timestamp: z.number(),
  envs: z.array(envSchema),
  tests: z.array(testCaseSchema),
  results: z.array(z.array(testResultSchema)),

  // Optional
  description: z.string().optional(),
  canceled: z.boolean().optional(),
});
export type Run = z.infer<typeof runSchema>;

// App interfaces

export interface StorageProvider {
  getName(): string;
  getConfig(name: string): Promise<NormalizedConfig>;
  getAllRuns(configName: string): Promise<Run[]>;
  addRun(configName: string, run: Run): Promise<void>;
  getConfigNames(): Promise<string[]>;

  getAnnotations(configName: string, runTimestamp: number): Promise<AnnotationLogEntry[]>;
  logAnnotation(
    configName: string,
    runTimestamp: number,
    annotation: AnnotationLogEntry,
  ): Promise<void>;
}

export type PromptPart = { text: string } | { file: File };
export type MultiPartPrompt = PromptPart[];
export interface RolePromptPart {
  role: 'user' | 'assistant' | 'system';
  content: MultiPartPrompt;
}
export type ConversationPrompt = RolePromptPart[];

export interface RunContext {
  abortSignal: AbortSignal;
  cache?: ModelCache;
  cacheKey?: Record<string, unknown>;
  session?: ModelSession;
}

export type ModelUpdate =
  | {
      type: 'replace' | 'append';
      output: ProviderOutputPart;
      internalId?: string; // Unique ID for the update, used for history
    }
  | { type: 'begin-stream' };

// A con
export interface ModelSession {
  state: unknown;
  close?: () => MaybePromise<void>;
  skipCache?: boolean;
}
export interface ModelResponse {
  response: unknown;
  session?: ModelSession;
}
export type ModelGenerator = AsyncGenerator<string | ModelUpdate, ModelResponse, void>;
export type ModelRunner = () => ModelGenerator;

export interface ModelProvider {
  id: string;
  run(
    prompt: ConversationPrompt,
    context: RunContext,
  ): MaybePromise<{ request: unknown; runModel: ModelRunner }>;
  extractOutput(response: unknown): MaybePromise<string | ExtractedOutputPart[]>;
  extractTokenUsage(response: unknown): TokenUsage;
  mimeTypes?: string[];
  requestSemaphore?: Semaphore;
}

export interface TestEnvironment {
  run(test: TestCase, context: RunContext): AsyncGenerator<string | ModelUpdate, TestOutput, void>;
  provider: { id: string | null; labeled?: Record<string, { id: string }> };
  prompt: NormalizedPrompt;
}

export interface TaskQueue {
  enqueue(fn: () => Promise<void>): void;
  completed(): Promise<void>;
  abort(): void;
}

export interface PromptFormatter {
  prompt: string;
  format(vars: VarSet, mimeTypes: string[] | undefined): Promise<ConversationPrompt>;
}

export interface FileLoader {
  loadFile(path: string): Promise<File>;
}

export type MaybePromise<T> = T | Promise<T>;
export interface CellAssertionProvider {
  run: (
    output: ProviderOutput,
    context: {
      provider: TestEnvironment['provider'];
      prompt: TestEnvironment['prompt'];
    },
  ) => MaybePromise<AssertionResult>;
  destroy?: () => void;
}
export interface RowAssertionProvider {
  type: 'row';
  run: (
    results: TestOutput[],
    context: {
      prompts: TestEnvironment['prompt'][];
    },
  ) => MaybePromise<AssertionResult[]>;
  destroy?: () => void;
}
export type AssertionProvider = CellAssertionProvider | RowAssertionProvider;

export interface LiveResult {
  // Required
  rawPrompt?: unknown;
  state: 'waiting' | 'in-progress' | 'success' | 'error';

  // Success
  history?: (Omit<LiveResult, 'state' | 'history' | 'assertionResults'> & { id: string })[];
  output?: ProviderOutputPart[];
  rawOutput?: unknown;
  latencyMillis?: number;
  tokenUsage?: TokenUsage;
  assertionResults?: AssertionResult[];

  // Error
  error?: string;
}
export interface LiveRun {
  // Static
  id: string;
  timestamp: number;
  description?: string;
  canceled: boolean;

  envs: Env[];
  tests: TestCase[];

  // Generated
  varNames: string[];
  summaries: Readable<SummaryStats>[]; // One per env

  // Dynamic
  results: Readable<LiveResult>[][];
}

export interface AssertionStats {
  description: string;
  avgPass: number;
  outputStats: Record<
    string,
    { type: 'boolean'; avgTrue: number } | { type: 'number'; avgNumber: number }
  >;
}

export interface SummaryStats {
  total: number;
  passed: number;
  failed: number;
  avgLatencyMillis?: number;
  avgCostDollars?: number;
  assertions: AssertionStats[];
}

export interface ModelCache {
  set(key: unknown, value: unknown): Promise<void>;
  get(key: unknown): Promise<unknown>;
}

// Annotations

// TODO: hybrid logical clock
export const clockSchema = z.number().int().positive();
export type Clock = z.infer<typeof clockSchema>;

export const annotationLogEntrySchema = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('set-cell-notes'),
      clock: clockSchema,
      index: z.tuple([z.number(), z.number()]),
      notes: z.string(),
    }),
    z.object({
      type: z.literal('unknown'),
    }),
  ])
  .catch({ type: 'unknown' });

export type AnnotationLogEntry = z.infer<typeof annotationLogEntrySchema>;
