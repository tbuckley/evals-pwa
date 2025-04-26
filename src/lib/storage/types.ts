import { z } from 'zod';
import { CodeReference } from './CodeReference';
import { globalOptionsSchema } from '$lib/types';

// Schemas & types for validating files match the expected structure

export const fsVarSchema = z.any();

export const fsVarSetSchema = z.record(z.string(), fsVarSchema);

export const fsAssertionSchema = z.object({
  // Required
  type: z.string(),

  // Optional
  description: z.string().optional(),
  vars: z.record(z.string(), z.unknown()).optional(),
  id: z.string().optional(),
});
export type FsAssertion = z.infer<typeof fsAssertionSchema>;

export const fsExpandedProviderSchema = z.object({
  id: z.string(),
  labels: z.array(z.string()).optional(),
  config: z.object({}).passthrough().optional(),
  prompts: z.array(z.string()).optional(),
});
export const fsProviderSchema = z.union([z.string(), fsExpandedProviderSchema]);

export const fsConvoPromptSchema = z.array(
  z.union([
    z.object({ system: z.string() }),
    z.object({ user: z.string() }),
    z.object({ assistant: z.string() }),
  ]),
);
export const fsPipelinePromptSchema = z.object({
  $pipeline: z.array(
    z.union([
      z.string(),
      fsConvoPromptSchema,
      z.object({
        id: z.string().optional(),
        prompt: z.union([z.string(), fsConvoPromptSchema]),
        providerLabel: z.string().optional(),
        outputAs: z.string().optional(),
        if: z.union([z.string(), z.instanceof(CodeReference)]).optional(),
        deps: z.array(z.string()).optional(),
      }),
    ]),
  ),
});
export const fsPromptSchema = z.union([
  z.string(),
  z.object({ prompt: z.string(), providerLabel: z.string().optional() }),
  fsConvoPromptSchema,
  fsPipelinePromptSchema,
]);
export type FsPipelinePrompt = z.infer<typeof fsPipelinePromptSchema>;
export type FsPrompt = z.infer<typeof fsPromptSchema>;

export const fsTestCaseSchema = z.object({
  // Optional
  vars: fsVarSetSchema.optional(),
  description: z.string().optional(),
  assert: z.array(fsAssertionSchema).optional(),
  only: z.boolean().optional(),
  repeat: z.number().int().positive().optional(),
});
export type FsTestCase = z.infer<typeof fsTestCaseSchema>;

export const fsGlobalOptionsSchema = globalOptionsSchema;
export type FsGlobalOptions = z.infer<typeof fsGlobalOptionsSchema>;

export const fsConfigSchema = z.object({
  description: z.string().optional(),

  providers: z.array(fsProviderSchema).optional(),
  prompts: z.array(fsPromptSchema).optional(),
  tests: z.array(fsTestCaseSchema).optional(),
  defaultTest: fsTestCaseSchema.optional(),
  options: fsGlobalOptionsSchema.optional(),
});
export type FsConfig = z.infer<typeof fsConfigSchema>;
