import type { Readable } from 'svelte/store';
import { z } from 'zod';

const varSchema = z.string();

const varSetSchema = z.record(z.string(), varSchema);

const assertionSchema = z.object({
	// Required
	type: z.string(),

	// Optional
	description: z.string().optional(),
	vars: z.record(z.string(), z.unknown()).optional()
});
const normalizedProviderSchema = z.object({
	id: z.string(),
	config: z.object({}).passthrough().optional(),
	prompts: z.array(z.string()).optional()
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
	message: z.string().optional()
});
export type AssertionResult = z.infer<typeof assertionResultSchema>;

const tokenUsageSchema = z.object({
	// Optional
	inputTokens: z.number().int().optional(),
	outputTokens: z.number().int().optional(),
	totalTokens: z.number().int().optional(),
	costDollars: z.number().optional()
});
export type TokenUsage = z.infer<typeof tokenUsageSchema>;

const testOutputSchema = z.object({
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

const testResultSchema = testOutputSchema.extend({
	// Required
	pass: z.boolean(),
	assertionResults: z.array(assertionResultSchema)
});
export type TestResult = z.infer<typeof testResultSchema>;

const testCaseSchema = z.object({
	// Optional
	vars: varSetSchema.optional(),
	description: z.string().optional(),
	assert: z.array(assertionSchema).optional()
});
export type TestCase = z.infer<typeof testCaseSchema>;

export const runSchema = z.object({
	version: z.literal(1),

	// Required
	id: z.string(),
	timestamp: z.number(),
	envs: z.array(
		z.object({
			provider: providerSchema,
			prompt: promptSchema
		})
	),
	tests: z.array(testCaseSchema),
	results: z.array(z.array(testResultSchema)),

	// Optional
	description: z.string().optional()
});
export type Run = z.infer<typeof runSchema>;

// App interfaces

export interface StorageProvider {
	getName(): string;
	getConfig(): Promise<NormalizedConfig>;
	getAllRuns(): Promise<Run[]>;
	addRun(run: Run): Promise<void>;
}

export type PromptPart = { text: string } | { image: File };
export type MultiPartPrompt = Array<PromptPart>;

export interface ModelProvider {
	run(prompt: MultiPartPrompt): Promise<unknown>;
	extractOutput(response: unknown): string;
	extractTokenUsage(response: unknown): TokenUsage;
}

export interface TestEnvironment {
	run(test: TestCase): Promise<TestOutput>;
}

export interface TaskQueue {
	enqueue(fn: () => Promise<void>): void;
	completed(): Promise<void>;
	abort(): void;
}

export type PopulatedVarSet = Record<string, string | File>;
export interface PromptFormatter {
	format(vars: PopulatedVarSet): MultiPartPrompt;
}

export interface FileLoader {
	loadFile(path: string): Promise<File>;
}

export type MaybePromise<T> = T | Promise<T>;
export interface AssertionProvider {
	run(output: string): MaybePromise<AssertionResult>;
	destroy?: () => void;
}

export type ErrorState =
	| { type: 'missing-config'; path: string }
	| { type: 'invalid-config'; errors: string[] }
	| { type: 'missing-config-reference'; path: string };

export class UiError extends Error {
	constructor(
		public detail: ErrorState,
		message?: string
	) {
		super(message);
	}
}

export interface LiveResult {
	// Required
	rawPrompt: unknown;
	state: 'waiting' | 'in-progress' | 'success' | 'error';

	// Success
	output?: string;
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

	envs: { provider: Provider; prompt: Prompt }[];
	tests: TestCase[];

	// Generated
	varNames: string[];

	// Dynamic
	results: Readable<LiveResult>[][];
}
