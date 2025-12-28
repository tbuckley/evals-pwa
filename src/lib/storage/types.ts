import { z } from 'zod';
import { CodeReference } from './CodeReference';
import { globalOptionsSchema } from '$lib/types';

// Schemas & types for validating files match the expected structure

export const fsVarSchema = z.any();

export const fsVarSetSchema = z.record(z.string(), fsVarSchema);

export const fsAssertionSchema = z
  .object({
    // Required
    type: z.string(),

    // Optional
    description: z.string().optional(),
    vars: z.record(z.string(), z.unknown()).optional(),
    id: z.string().optional(),
  })
  .strict();
export type FsAssertion = z.infer<typeof fsAssertionSchema>;

export const fsExpandedProviderSchema = z
  .object({
    id: z.union([z.string(), z.instanceof(CodeReference)]),
    labels: z.array(z.string()).optional(),
    config: z.object({}).passthrough().optional(),
    env: z.array(z.string()).optional(),
    prompts: z.array(z.string()).optional(),
  })
  .strict();
export const fsProviderSchema = z.union([
  z.string(),
  z.instanceof(CodeReference),
  fsExpandedProviderSchema,
]);
export type FsProvider = z.infer<typeof fsProviderSchema>;

export const fsConvoPromptSchema = z.array(
  z.union([
    z.object({ system: z.string() }).strict(),
    z.object({ user: z.string() }).strict(),
    z.object({ assistant: z.string() }).strict(),
  ]),
);
export const fsPipelinePromptSchema = z
  .object({
    $pipeline: z.array(
      z.union([
        z.string(),
        fsConvoPromptSchema,
        z.object({
          id: z.string().optional(),
          prompt: z.union([z.string(), fsConvoPromptSchema]).optional(),
          transform: z.union([z.string(), z.instanceof(CodeReference)]).optional(),
          providerLabel: z.string().optional(),
          outputAs: z.string().optional(),
          if: z.union([z.string(), z.instanceof(CodeReference)]).optional(),
          deps: z.array(z.string()).optional(),
          session: z.union([z.string(), z.boolean()]).optional(),
          functionCalls: z.enum(['loop', 'once', 'never']).optional(),
          state: z.array(z.string()).optional(),
        }),
      ]),
    ),
  })
  .strict();
export const fsPromptSchema = z.union([
  z.string(),
  z.object({ prompt: z.string(), providerLabel: z.string().optional() }).strict(),
  fsConvoPromptSchema,
  fsPipelinePromptSchema,
]);
export type FsPipelinePrompt = z.infer<typeof fsPipelinePromptSchema>;
export type FsPrompt = z.infer<typeof fsPromptSchema>;

export const fsTestCaseSchema = z
  .object({
    // Optional
    vars: fsVarSetSchema.optional(),
    description: z.string().optional(),
    assert: z.array(fsAssertionSchema).optional(),
    only: z.boolean().optional(),
    repeat: z.number().int().positive().optional(),
  })
  .strict();
export type FsTestCase = z.infer<typeof fsTestCaseSchema>;

export const fsGlobalOptionsSchema = globalOptionsSchema.strict();
export type FsGlobalOptions = z.infer<typeof fsGlobalOptionsSchema>;

export const fsConfigSchema = z
  .object({
    description: z.string().optional(),

    providers: z.array(fsProviderSchema).optional(),
    prompts: z.array(fsPromptSchema).optional(),
    tests: z.array(fsTestCaseSchema).optional(),
    defaultTest: fsTestCaseSchema.optional(),
    options: fsGlobalOptionsSchema.optional(),
  })
  .strict();
export type FsConfig = z.infer<typeof fsConfigSchema>;
