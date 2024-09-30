import { z } from 'zod';

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
  config: z.object({}).passthrough().optional(),
  prompts: z.array(z.string()).optional(),
});
export const fsProviderSchema = z.union([z.string(), fsExpandedProviderSchema]);

export const fsPromptSchema = z.string();

export const fsTestCaseSchema = z.object({
  // Optional
  vars: fsVarSetSchema.optional(),
  description: z.string().optional(),
  assert: z.array(fsAssertionSchema).optional(),
  only: z.boolean().optional(),
});
export type FsTestCase = z.infer<typeof fsTestCaseSchema>;

export const fsConfigSchema = z.object({
  description: z.string().optional(),

  providers: z.array(fsProviderSchema).optional(),
  prompts: z.array(fsPromptSchema).optional(),
  tests: z.array(fsTestCaseSchema).optional(),
  defaultTest: fsTestCaseSchema.optional(),
});
export type FsConfig = z.infer<typeof fsConfigSchema>;
