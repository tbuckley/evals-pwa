import type {
	TestEnvironment,
	ModelProvider,
	TestOutput,
	PromptFormatter,
	TokenUsage,
	VarSet,
	RunContext,
	MultiPartPrompt
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

	async *run(vars: VarSet, context: RunContext): AsyncGenerator<string, TestOutput, void> {
		let prompt: MultiPartPrompt;
		try {
			prompt = await this.prompt.format(vars, this.model.mimeTypes);
		} catch (e) {
			if (e instanceof Error) {
				return {
					error: e.toString()
				};
			}
			throw e;
		}

		const start = Date.now();
		let resp: unknown;
		try {
			const generator = this.model.run(prompt, context);
			let next;
			while (!next || !next.done) {
				next = await generator.next();
				if (!next.done) {
					yield next.value;
				}
			}
			resp = next.value;
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
