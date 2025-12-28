import type { JavascriptAssertionArgs } from '$lib/assertions/javascript';
import type { CodeReference, Executable, ModuleExecutable } from '$lib/storage/CodeReference';
import type { FileReference } from '$lib/storage/FileReference';
import type {
  AssertionResult,
  ConversationPrompt,
  MultiPartPrompt,
  NormalizedPipelineStep,
  NormalizedPrompt,
  ProviderOutput,
  ProviderOutputPart,
  PromptPart,
  Provider,
  RolePromptPart,
  TestOutput,
  TransformOutput,
} from '$lib/types';
import type * as DocTypes from './codeReferenceTypes';

type Assert<T extends true> = T;
type IsAssignable<A, B> = [A] extends [B] ? true : false;
type IsMutuallyAssignable<A, B> =
  IsAssignable<A, B> extends true ? (IsAssignable<B, A> extends true ? true : false) : false;

interface CodeReferencePublic {
  uri: string;
  file: File;
  type: 'file' | 'image' | 'code';
  bind(): Promise<Executable>;
  bindModule(): Promise<ModuleExecutable>;
  getCode(): Promise<string>;
}

interface CodeReferenceMarker {
  readonly __codeReference: unique symbol;
}
interface FileReferenceMarker {
  readonly __fileReference: unique symbol;
}
type ReplaceCodeReference<T> = T extends CodeReference | DocTypes.CodeReference
  ? CodeReferenceMarker
  : T extends FileReference | DocTypes.FileReference
    ? FileReferenceMarker
    : T extends File
      ? File
      : T extends (infer U)[]
        ? ReplaceCodeReference<U>[]
        : T extends object
          ? { [K in keyof T]: ReplaceCodeReference<T[K]> }
          : T;

type _CodeReferenceActual = Assert<IsAssignable<CodeReference, CodeReferencePublic>>;
type _CodeReferenceDoc = Assert<IsAssignable<DocTypes.CodeReference, CodeReferencePublic>>;
type _Executable = Assert<IsMutuallyAssignable<DocTypes.Executable, Executable>>;
type _ModuleExecutable = Assert<IsMutuallyAssignable<DocTypes.ModuleExecutable, ModuleExecutable>>;
type PromptPartShape =
  | { text: string }
  | { file: File }
  | {
      type: 'function-call';
      name: string;
      args: unknown;
      meta: unknown;
    }
  | {
      type: 'function-response';
      call: {
        type: 'function-call';
        name: string;
        args: unknown;
        meta: unknown;
      };
      response: unknown;
    };

type _PromptPartDocText = Assert<IsAssignable<{ text: string }, DocTypes.PromptPart>>;
type _PromptPartActualText = Assert<IsAssignable<{ text: string }, PromptPart>>;
type _PromptPartDocFile = Assert<IsAssignable<{ file: File }, DocTypes.PromptPart>>;
type _PromptPartActualFile = Assert<IsAssignable<{ file: File }, PromptPart>>;
type _PromptPartDocCall = Assert<
  IsAssignable<
    { type: 'function-call'; name: string; args: unknown; meta: unknown },
    DocTypes.PromptPart
  >
>;
type _PromptPartActualCall = Assert<
  IsAssignable<{ type: 'function-call'; name: string; args: unknown; meta: unknown }, PromptPart>
>;
type _PromptPartDocResponse = Assert<
  IsAssignable<
    {
      type: 'function-response';
      call: { type: 'function-call'; name: string; args: unknown; meta: unknown };
      response: unknown;
    },
    DocTypes.PromptPart
  >
>;
type _PromptPartActualResponse = Assert<
  IsAssignable<
    {
      type: 'function-response';
      call: { type: 'function-call'; name: string; args: unknown; meta: unknown };
      response: unknown;
    },
    PromptPart
  >
>;
type _MultiPartPromptDoc = Assert<
  IsMutuallyAssignable<DocTypes.MultiPartPrompt, DocTypes.PromptPart[]>
>;
type _MultiPartPromptActual = Assert<IsMutuallyAssignable<MultiPartPrompt, PromptPart[]>>;
type _RolePromptPartDoc = Assert<
  IsMutuallyAssignable<
    DocTypes.RolePromptPart,
    { role: RolePromptPart['role']; content: DocTypes.MultiPartPrompt }
  >
>;
type _RolePromptPartActual = Assert<
  IsMutuallyAssignable<RolePromptPart, { role: RolePromptPart['role']; content: MultiPartPrompt }>
>;
type _ConversationPromptDoc = Assert<
  IsMutuallyAssignable<DocTypes.ConversationPrompt, DocTypes.RolePromptPart[]>
>;
type _ConversationPromptActual = Assert<IsMutuallyAssignable<ConversationPrompt, RolePromptPart[]>>;

type _PromptPartShape = Assert<IsAssignable<DocTypes.PromptPart, PromptPartShape>>;
type _Provider = Assert<
  IsMutuallyAssignable<ReplaceCodeReference<DocTypes.Provider>, ReplaceCodeReference<Provider>>
>;
type _JavascriptAssertionArgs = Assert<
  IsMutuallyAssignable<
    ReplaceCodeReference<DocTypes.JavascriptAssertionArgs>,
    ReplaceCodeReference<JavascriptAssertionArgs>
  >
>;
interface ExpectedJavascriptAssertionResult {
  pass: boolean;
  message?: string;
  visuals?: (string | Blob)[];
  outputs?: Record<string, boolean | number>;
}
type _JavascriptAssertionResult = Assert<
  IsMutuallyAssignable<DocTypes.JavascriptAssertionResult, ExpectedJavascriptAssertionResult>
>;
type _ProviderOutput = Assert<
  IsAssignable<ReplaceCodeReference<DocTypes.ProviderOutput>, ReplaceCodeReference<ProviderOutput>>
>;
type _ProviderOutputPart = Assert<
  IsAssignable<
    ReplaceCodeReference<DocTypes.ProviderOutputPart>,
    ReplaceCodeReference<ProviderOutputPart>
  >
>;
type _TransformOutput = Assert<
  IsAssignable<
    ReplaceCodeReference<DocTypes.TransformOutput>,
    ReplaceCodeReference<TransformOutput>
  >
>;
type _TestOutput = Assert<
  IsAssignable<ReplaceCodeReference<DocTypes.TestOutput>, ReplaceCodeReference<TestOutput>>
>;
type _NormalizedPrompt = Assert<
  IsAssignable<
    ReplaceCodeReference<DocTypes.NormalizedPrompt>,
    ReplaceCodeReference<NormalizedPrompt>
  >
>;
type _AssertionResult = Assert<
  IsAssignable<
    ReplaceCodeReference<DocTypes.AssertionResult>,
    ReplaceCodeReference<AssertionResult>
  >
>;
type _PipelineIf = Assert<
  IsMutuallyAssignable<
    ReplaceCodeReference<DocTypes.PipelineIf>,
    ReplaceCodeReference<NormalizedPipelineStep['if']>
  >
>;
type _PipelineTransform = Assert<
  IsMutuallyAssignable<
    ReplaceCodeReference<DocTypes.PipelineTransform>,
    ReplaceCodeReference<NormalizedPipelineStep['transform']>
  >
>;

type ExpectedPromptTransformHandler = (
  output: DocTypes.ProviderOutput,
  context: { vars: DocTypes.PipelineVars },
) =>
  | DocTypes.TransformOutput
  | DocTypes.TransformResult
  | Promise<DocTypes.TransformOutput | DocTypes.TransformResult>;

type ExpectedPromptIfHandler = (vars: DocTypes.PipelineVars) => boolean | Promise<boolean>;

type ExpectedProviderPrepareHandler = (
  prompt: DocTypes.ConversationPrompt,
  context: DocTypes.ProviderConfigContext,
) => DocTypes.MaybePromise<unknown>;

type ExpectedProviderRunHandler = (
  key: unknown,
  context: DocTypes.ProviderConfigContext,
) =>
  | string
  | (string | Blob | DocTypes.MetaProviderOutputPart)[]
  | DocTypes.MaybePromise<string | (string | Blob | DocTypes.MetaProviderOutputPart)[]>;

type ExpectedProviderEnvHandler = () => DocTypes.MaybePromise<string[]>;

type ExpectedAssertionCellHandler = (
  output: DocTypes.ProviderOutput,
  context: DocTypes.AssertionCellContext,
) => DocTypes.MaybePromise<DocTypes.JavascriptAssertionResult>;

type ExpectedAssertionRowHandler = (
  results: DocTypes.TestOutput[],
  context: DocTypes.AssertionRowContext,
) => DocTypes.MaybePromise<DocTypes.JavascriptAssertionResult[]>;

type _PromptTransformHandler = Assert<
  IsMutuallyAssignable<DocTypes.PromptTransformHandler, ExpectedPromptTransformHandler>
>;
type _PromptIfHandler = Assert<
  IsMutuallyAssignable<DocTypes.PromptIfHandler, ExpectedPromptIfHandler>
>;
type _ProviderPrepareHandler = Assert<
  IsMutuallyAssignable<DocTypes.ProviderPrepareHandler, ExpectedProviderPrepareHandler>
>;
type _ProviderRunHandler = Assert<
  IsMutuallyAssignable<DocTypes.ProviderRunHandler, ExpectedProviderRunHandler>
>;
type _ProviderEnvHandler = Assert<
  IsMutuallyAssignable<DocTypes.ProviderEnvHandler, ExpectedProviderEnvHandler>
>;
type _AssertionCellHandler = Assert<
  IsMutuallyAssignable<DocTypes.AssertionCellHandler, ExpectedAssertionCellHandler>
>;
type _AssertionRowHandler = Assert<
  IsMutuallyAssignable<DocTypes.AssertionRowHandler, ExpectedAssertionRowHandler>
>;
