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

export type PromptPart = { text: string } | { file: File } | FunctionTool;
export type MultiPartPrompt = PromptPart[];
export interface RolePromptPart {
  role: 'user' | 'assistant' | 'system';
  content: MultiPartPrompt;
}
export type ConversationPrompt = RolePromptPart[];

export interface JavascriptAssertionArgs {
  code: string | CodeReference;
  row?: boolean;
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

export interface FsProviderDefinition {
  id: ProviderId;
  labels?: string[];
  config?: Record<string, unknown>;
  env?: string[];
  prompts?: string[];
}
export type FsProvider = string | CodeReference | FsProviderDefinition;

export type FsConvoPrompt = ({ system: string } | { user: string } | { assistant: string })[];

export interface FsPipelineStep {
  id?: string;
  prompt?: string | FsConvoPrompt;
  transform?: string | CodeReference;
  providerLabel?: string;
  outputAs?: string;
  if?: string | CodeReference;
  deps?: string[];
  session?: string | boolean;
  functionCalls?: 'loop' | 'once' | 'never';
  state?: string[];
}

export interface FsPipelinePrompt {
  $pipeline: (string | FsConvoPrompt | FsPipelineStep)[];
}

export type FsPrompt =
  | string
  | { prompt: string; providerLabel?: string }
  | FsConvoPrompt
  | FsPipelinePrompt;

export interface FsAssertion {
  type: string;
  description?: string;
  vars?: Record<string, unknown>;
  id?: string;
}

export interface FsTestCase {
  vars?: Record<string, unknown>;
  description?: string;
  assert?: FsAssertion[];
  only?: boolean;
  repeat?: number;
}

export interface FsConfig {
  description?: string;
  providers?: FsProvider[];
  prompts?: FsPrompt[];
  tests?: FsTestCase[];
  defaultTest?: FsTestCase;
  options?: {
    maxConcurrency?: number;
  };
}

export interface Generator {
  '=gen': string | CodeReference;
  args?: unknown[];
}
