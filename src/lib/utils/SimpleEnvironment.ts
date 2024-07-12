import type {
	TestEnvironment,
	ModelProvider,
	TestOutput,
	PromptFormatter,
	VarSet
} from '$lib/types';

export class SimpleEnvironment implements TestEnvironment {
	model: ModelProvider;
	prompt: PromptFormatter;

	constructor(model: ModelProvider, prompt: PromptFormatter) {
		this.model = model;
		this.prompt = prompt;
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
		try {
			output = this.model.extractOutput(resp);
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
			latencyMillis
		};
	}
}
