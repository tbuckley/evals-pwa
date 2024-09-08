import type {
	TestEnvironment,
	ModelProvider,
	TestOutput,
	PromptFormatter,
	TokenUsage,
	VarSet
} from '$lib/types';

export interface Config {
	model: ModelProvider;
	prompt: PromptFormatter;
}

export class SimpleEnvironment implements TestEnvironment {
	model: ModelProvider;
	prompt: PromptFormatter;

	constructor(options: Config) {
		this.model = options.model;
		this.prompt = options.prompt;
	}

	async run(vars: VarSet): Promise<TestOutput> {
		const prompt = this.prompt.format(vars);

		const start = Date.now();
		let resp: unknown;
		try {
			resp = await this.model.run(prompt);
		} catch (e) {
			if (e instanceof Error) {
				return {
					rawPrompt: prompt,
					error: e.toString()
				};
			}
			throw e;
		}
		const latencyMillis = Date.now() - start;

		let output: string;
		let tokenUsage: TokenUsage;
		try {
			output = this.model.extractOutput(resp);
			tokenUsage = this.model.extractTokenUsage(resp);
		} catch (e) {
			if (e instanceof Error) {
				return {
					rawPrompt: prompt,
					rawOutput: resp,
					error: e.toString(),
					latencyMillis
				};
			}
			throw e;
		}

		return {
			rawPrompt: prompt,
			rawOutput: resp,
			output: output,
			latencyMillis,
			tokenUsage
		};
	}
}
