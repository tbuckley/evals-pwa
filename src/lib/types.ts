import { object, z } from 'zod';

export const varSchema = z.string();
export type Var = z.infer<typeof varSchema>;

export const varSetSchema = z.record(z.string(), varSchema);
export type VarSet = z.infer<typeof varSetSchema>;

export const assertionSchema = z.object({
	// Required
	type: z.string(),

	// Optional
	description: z.string().optional(),
	vars: z.record(z.string(), z.unknown()).optional()
});
export type Assertion = z.infer<typeof assertionSchema>;

export const providerSchema = z.union([
	z.string(),
	z.object({
		id: z.string(),
		// config: z.any().optional(),
		prompts: z.array(z.string()).optional()
	})
]);
export type Provider = z.infer<typeof providerSchema>;

export const promptSchema = z.string();
export type Prompt = z.infer<typeof promptSchema>;

export const testCaseSchema = z.object({
	// Optional
	vars: varSetSchema.optional(),
	description: z.string().optional(),
	assert: z.array(assertionSchema).optional()
});
export type TestCase = z.infer<typeof testCaseSchema>;

export const configSchema = z.object({
	description: z.string().optional(),

	providers: z.array(providerSchema).optional(),
	prompts: z.array(promptSchema).optional(),
	tests: z.array(testCaseSchema).optional()
});
export type Config = z.infer<typeof configSchema>;

// Output

export const assertionResultSchema = z.object({
	// Required
	pass: z.boolean(),

	// Optional
	message: z.string().optional()
});
export type AssertionResult = z.infer<typeof assertionResultSchema>;

export const tokenUsageSchema = z.object({
	// Optional
	inputTokens: z.number().int().optional(),
	outputTokens: z.number().int().optional(),
	totalTokens: z.number().int().optional(),
	costDollars: z.number().optional()
});
export type TokenUsage = z.infer<typeof tokenUsageSchema>;

export const testOutputSchema = z.object({
	// Required
	rawPrompt: z.unknown(),

	// Success
	rawOutput: z.unknown().optional(),
	output: z.string().optional(),
	latencyMillis: z.number().optional(),
	tokenUsage: tokenUsageSchema.optional(),

	// Error
	error: z.string().optional()
});
export type TestOutput = z.infer<typeof testOutputSchema>;

export const testResultSchema = testOutputSchema.extend({
	// Required
	pass: z.boolean(),
	assertionResults: z.array(assertionResultSchema)
});
export type TestResult = z.infer<typeof testResultSchema>;

export const runSchema = z.object({
	version: z.literal(1),

	// Required
	id: z.string(),
	timestamp: z.number(),
	envs: z.array(
		object({
			provider: providerSchema,
			prompt: promptSchema
		})
	),
	tests: z.array(testCaseSchema),
	results: z.array(z.array(testResultSchema))
});
export type Run = z.infer<typeof runSchema>;

// App interfaces

export interface StorageProvider {
	getConfig(): Promise<Config>;
	getAllRuns(): Promise<Run[]>;
	addRun(run: Run): Promise<void>;
}

export const multiPartPromptSchema = z.array(
	z.union([
		z.object({
			text: z.string()
		}),
		z.object({
			image: z.string()
		})
	])
);
export type MultiPartPrompt = z.infer<typeof multiPartPromptSchema>;

export type PopulatedPrompt = { text: string } | { image: File };
export type PopulatedMultiPartPrompt = Array<PopulatedPrompt>;

export interface ModelProvider {
	run(prompt: PopulatedMultiPartPrompt): Promise<unknown>;
	extractOutput(response: unknown): string;
	extractTokenUsage(response: unknown): TokenUsage;
}

export interface TestEnvironment {
	run(test: TestCase): Promise<TestOutput>;
}

export interface TaskQueue {
	enqueue(fn: () => Promise<void>): void;
	completed(): Promise<void>;
}

export interface PromptFormatter {
	format(vars: VarSet): MultiPartPrompt;
}

export interface FileLoader {
	loadFile(path: string): Promise<File>;
}

export type MaybePromise<T> = T | Promise<T>;
export interface AssertionProvider {
	run(output: string): MaybePromise<AssertionResult>;
	destroy?: () => void;
}
