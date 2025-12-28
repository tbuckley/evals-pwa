import type { JavascriptAssertionArgs } from '$lib/assertions/javascript';
import type { CodeReference, Executable, ModuleExecutable } from '$lib/storage/CodeReference';
import type { Generator } from '$lib/storage/runGenerators';
import type {
  FsConfig,
  FsPipelinePrompt,
  FsPrompt,
  FsProvider,
  FsTestCase,
} from '$lib/storage/types';
import type {
  ConversationPrompt,
  MultiPartPrompt,
  NormalizedPipelineStep,
  PromptPart,
  Provider,
  RolePromptPart,
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
type ReplaceCodeReference<T> = T extends CodeReference | DocTypes.CodeReference
  ? CodeReferenceMarker
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
type _FsProvider = Assert<
  IsMutuallyAssignable<ReplaceCodeReference<DocTypes.FsProvider>, ReplaceCodeReference<FsProvider>>
>;
type _FsPrompt = Assert<
  IsMutuallyAssignable<ReplaceCodeReference<DocTypes.FsPrompt>, ReplaceCodeReference<FsPrompt>>
>;
type _FsPipelinePrompt = Assert<
  IsMutuallyAssignable<
    ReplaceCodeReference<DocTypes.FsPipelinePrompt>,
    ReplaceCodeReference<FsPipelinePrompt>
  >
>;
type _FsConfig = Assert<
  IsMutuallyAssignable<ReplaceCodeReference<DocTypes.FsConfig>, ReplaceCodeReference<FsConfig>>
>;
type _FsTestCase = Assert<
  IsMutuallyAssignable<ReplaceCodeReference<DocTypes.FsTestCase>, ReplaceCodeReference<FsTestCase>>
>;
type _JavascriptAssertionArgs = Assert<
  IsMutuallyAssignable<
    ReplaceCodeReference<DocTypes.JavascriptAssertionArgs>,
    ReplaceCodeReference<JavascriptAssertionArgs>
  >
>;
type _Generator = Assert<
  IsMutuallyAssignable<ReplaceCodeReference<DocTypes.Generator>, ReplaceCodeReference<Generator>>
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
