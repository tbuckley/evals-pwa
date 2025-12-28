// Self-contained CodeReference-related type definitions for docs/downloads.
// This file must not import from $lib or any other local modules.

export type Executable = (...args: unknown[]) => Promise<unknown>;
export type ModuleExecutable = (name: string | undefined, ...args: unknown[]) => Promise<unknown>;

export declare class FileReference {
  readonly uri: string;
  readonly file: File;
  readonly type: 'file' | 'image' | 'code';
  constructor(uri: string, file: File, type?: 'file' | 'image' | 'code');
}

export declare class CodeReference extends FileReference {
  bind(): Promise<Executable>;
  bindModule(): Promise<ModuleExecutable>;
  getCode(): Promise<string>;
}

export type CodeReferenceInput = string | CodeReference;
export type PipelineIf = string | CodeReference | undefined;
export type PipelineTransform = string | CodeReference | undefined;

export interface FunctionCall {
  type: 'function-call';
  name: string;
  args: unknown;
  meta: unknown;
}
export interface FunctionResponse {
  type: 'function-response';
  call: FunctionCall;
  response: unknown;
}
export type FunctionTool = FunctionCall | FunctionResponse;

export interface MetaMessagePart {
  type: 'meta';
  title: string;
  icon: 'thinking' | 'search' | 'code' | 'other';
  message: string;
  data?: unknown;
}
export type MetaProviderOutputPart = MetaMessagePart | FunctionCall | FunctionResponse;

export type PromptPart = { text: string } | { file: File } | FunctionTool;
export type MultiPartPrompt = PromptPart[];
export interface RolePromptPart {
  role: 'user' | 'assistant' | 'system';
  content: MultiPartPrompt;
}
export type ConversationPrompt = RolePromptPart[];
export type ProviderOutputPart = string | FileReference | MetaProviderOutputPart;
export type ProviderOutput = string | ProviderOutputPart[];

export interface JavascriptAssertionArgs {
  code: string | CodeReference;
  row?: boolean;
}
export interface JavascriptAssertionResult {
  pass: boolean;
  message?: string;
  visuals?: (string | Blob)[];
  outputs?: Record<string, boolean | number>;
}

export type ProviderId = string | CodeReference;
export interface NormalizedProviderConfig extends Record<string, unknown> {
  mimeTypes?: string[];
}
export interface ProviderDefinition {
  id: ProviderId;
  labels?: string[];
  config?: NormalizedProviderConfig;
  env?: string[];
  prompts?: string[];
}
export type Provider = string | CodeReference | ProviderDefinition;

export type Var = unknown;
export type VarSet = Record<string, Var>;

export interface AssertionResult {
  pass: boolean;
  message?: string;
  visuals?: (string | FileReference)[];
  outputs?: Record<string, boolean | number>;
  id?: string;
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costDollars?: number;
}

export interface TestOutput {
  rawPrompt: unknown;
  rawOutput?: unknown;
  output?: ProviderOutput;
  latencyMillis?: number;
  tokenUsage?: TokenUsage;
  error?: string;
}

export interface NormalizedPipelineStep {
  id: string;
  prompt?: string;
  outputAs?: string;
  if?: string | CodeReference;
  deps?: string[];
  providerLabel?: string;
  session?: string | boolean;
  functionCalls?: 'loop' | 'once' | 'never';
  transform?: string | CodeReference;
  state?: string[];
}
export interface NormalizedPipelinePrompt {
  $pipeline: NormalizedPipelineStep[];
}
export type NormalizedPrompt =
  | string
  | { prompt: string; providerLabel?: string }
  | NormalizedPipelinePrompt;

export interface HistoryItem {
  id: string;
  prompt: ConversationPrompt;
  output: ProviderOutput;
}
export interface PipelineVars extends VarSet {
  $output: ProviderOutput | null;
  $history: HistoryItem[];
  $state?: VarSet;
  $args?: unknown;
}

export type TransformOutput = string | (string | Blob | MetaProviderOutputPart)[];
export interface TransformResult {
  vars?: VarSet;
  output?: TransformOutput;
}

export interface ProviderConfigContext {
  env: Record<string, string>;
  config: Record<string, unknown>;
}

export type MaybePromise<T> = T | Promise<T>;

export type PromptTransformHandler = (
  output: ProviderOutput,
  context: { vars: PipelineVars },
) => MaybePromise<TransformOutput | TransformResult>;

export type PromptIfHandler = (vars: PipelineVars) => MaybePromise<boolean>;

export type ProviderPrepareHandler = (
  prompt: ConversationPrompt,
  context: ProviderConfigContext,
) => MaybePromise<unknown>;

export type ProviderRunOutput = string | (string | Blob | MetaProviderOutputPart)[];

export type ProviderRunHandler = (
  key: unknown,
  context: ProviderConfigContext,
) => MaybePromise<ProviderRunOutput>;

export type ProviderEnvHandler = () => MaybePromise<string[]>;

export interface AssertionCellContext {
  provider: { id: string | CodeReference | null; labeled?: Record<string, { id: string }> };
  prompt: NormalizedPrompt;
}
export interface AssertionRowContext {
  prompts: NormalizedPrompt[];
}
export type AssertionCellHandler = (
  output: ProviderOutput,
  context: AssertionCellContext,
) => MaybePromise<JavascriptAssertionResult>;
export type AssertionRowHandler = (
  results: TestOutput[],
  context: AssertionRowContext,
) => MaybePromise<JavascriptAssertionResult[]>;
