import { z } from 'zod';

// Helper types

export const varSchema = z.union([
	z.string(),
	z.object({
		type: z.literal('image'),
		path: z.string()
	})
]);

export type Var = z.infer<typeof varSchema>;

export const assertionSchema = z.object({
	// Required
	type: z.string(),

	// Optional
	description: z.string().optional(),
	vars: z.record(z.string(), z.unknown()).optional()
});

export type Assertion = z.infer<typeof assertionSchema>;

// Public types

export const promptSchema = z.object({
	version: z.literal(1),

	// Required
	id: z.string(),
	provider: z.string(),
	model: z.string(),
	prompt: z.unknown(),

	// Optional
	description: z.string().optional(),
	defaultVars: z.record(z.string(), varSchema).optional()
});

export type Prompt = z.infer<typeof promptSchema>;

export const testCaseSchema = z.object({
	version: z.literal(1),

	// Required
	id: z.string(),
	vars: z.record(z.string(), varSchema),

	// Optional
	description: z.string().optional(),
	assert: z.array(assertionSchema).optional()
});

export type TestCase = z.infer<typeof testCaseSchema>;

export const testResultSchema = z.object({
	// Required
	rawPrompt: z.unknown(),
	rawOutput: z.unknown(),
	output: z.string(),
	pass: z.boolean(),
	latencyMillis: z.number(),

	// Optional
	message: z.string().optional()
});

export type TestResult = z.infer<typeof testResultSchema>;

export const runSchema = z.object({
	version: z.literal(1),

	// Required
	id: z.string(),
	timestamp: z.number(),
	prompts: z.array(promptSchema),
	tests: z.array(testCaseSchema),
	results: z.array(z.array(testResultSchema))
});

export type Run = z.infer<typeof runSchema>;

// App interfaces

export interface StorageProvider {
	getAllPrompts(): Promise<Prompt[]>;
	getAllTestCases(): Promise<TestCase[]>;
	getBlob(path: string): Promise<Blob>;
	getAllRuns(): Promise<Run[]>;

	addRun(run: Run): Promise<void>;
	reload(): Promise<void>;
}

export interface ModelProvider {
	run(prompt: unknown): Promise<unknown>;
	extractOutput(response: unknown): string;
}
