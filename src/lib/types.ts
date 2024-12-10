import type { Readable } from 'svelte/store';
import { z } from 'zod';
import { FileReference } from './storage/FileReference';

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
  config: normalizedProviderConfigSchema.passthrough().optional(),
  prompts: z.array(z.string()).optional(),
});
export const providerSchema = z.union([z.string(), normalizedProviderSchema]);
const promptSchema = z.string();

export type Var = z.infer<typeof varSchema>;
export type VarSet = z.infer<typeof varSetSchema>;
export type Assertion = z.infer<typeof assertionSchema>;
export type NormalizedProvider = z.infer<typeof normalizedProviderSchema>;
export type Provider = z.infer<typeof providerSchema>;
export type Prompt = z.infer<typeof promptSchema>;
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
  prompts: Prompt[];
  tests: NormalizedTestCase[];
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

const testOutputSchema = z.object({
  // Required
  rawPrompt: z.unknown(),

  // Success
  rawOutput: z.unknown().optional(),
  output: z
    .union([z.string(), z.array(z.union([z.string(), z.instanceof(FileReference)]))])
    .optional(),
  latencyMillis: z.number().optional(),
  tokenUsage: tokenUsageSchema.optional(),

  // Error
  error: z.string().optional(),
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
  provider: providerSchema,
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
}

export interface ReadonlyFileStorage {
  load(uri: string): Promise<File | { uri: string; file: File }[]>;
  loadFile(uri: string): Promise<File>;
}

export interface FileStorage extends ReadonlyFileStorage {
  getName(): string;
  writeFile(uri: string, data: string | Blob): Promise<void>;
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
}

export interface ModelUpdate {
  type: 'replace';
  output: string;
}

export type ModelGenerator = () => AsyncGenerator<string | ModelUpdate, unknown, void>;

export interface ModelProvider {
  id: string;
  run(
    prompt: ConversationPrompt,
    context: RunContext,
  ): MaybePromise<{ request: unknown; run: ModelGenerator }>;
  extractOutput(response: unknown): MaybePromise<string | (string | Blob)[]>;
  extractTokenUsage(response: unknown): TokenUsage;
  mimeTypes?: string[];
}

export interface TestEnvironment {
  run(test: TestCase, context: RunContext): AsyncGenerator<string | ModelUpdate, TestOutput, void>;
  provider: Pick<NormalizedProvider, 'id'>;
  prompt: Prompt;
}

export interface TaskQueue {
  enqueue(fn: () => Promise<void>): void;
  completed(): Promise<void>;
  abort(): void;
}

export interface PromptFormatter {
  prompt: Prompt;
  format(vars: VarSet, mimeTypes: string[] | undefined): Promise<ConversationPrompt>;
}

export interface FileLoader {
  loadFile(path: string): Promise<File>;
}

export type MaybePromise<T> = T | Promise<T>;
export interface AssertionProvider {
  run(
    output: string | (string | FileReference)[],
    context: { provider: Pick<NormalizedProvider, 'id'>; prompt: Prompt },
  ): MaybePromise<AssertionResult>;
  destroy?: () => void;
}

export type ErrorState =
  | { type: 'missing-config'; path: string }
  | { type: 'invalid-config'; errors: string[] }
  | { type: 'missing-config-reference'; path: string };

export class UiError extends Error {
  constructor(
    public detail: ErrorState,
    message?: string,
  ) {
    super(message);
  }
}
export class MissingFileError extends Error {
  constructor(public path: string) {
    super(`File not found: ${path}`);
  }
}

export interface LiveResult {
  // Required
  rawPrompt: unknown;
  state: 'waiting' | 'in-progress' | 'success' | 'error';

  // Success
  output?: (string | FileReference)[];
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
