import type {
	TestEnvironment,
	ModelProvider,
	TestOutput,
	PromptFormatter,
	VarSet,
	FileLoader,
	MultiPartPrompt,
	PopulatedMultiPartPrompt
} from '$lib/types';

export interface Config {
	model: ModelProvider;
	prompt: PromptFormatter;
	loader: FileLoader;
}

export class SimpleEnvironment implements TestEnvironment {
	model: ModelProvider;
	prompt: PromptFormatter;
	loader: FileLoader;

	constructor(options: Config) {
		this.model = options.model;
		this.prompt = options.prompt;
		this.loader = options.loader;
	}

	async run(vars: VarSet): Promise<TestOutput> {
		const prompt = this.prompt.format(vars);
		const populatedPrompt = await populate(prompt, this.loader);
		console.log(prompt, populatedPrompt);

		const start = Date.now();
		let resp: unknown;
		try {
			resp = await this.model.run(populatedPrompt);
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

async function populate(
	prompt: MultiPartPrompt,
	loader: FileLoader
): Promise<PopulatedMultiPartPrompt> {
	const populated: PopulatedMultiPartPrompt = [];
	for (const part of prompt) {
		if ('text' in part) {
			populated.push({ text: part.text });
		} else if ('image' in part) {
			populated.push({ image: await loader.loadFile(part.image) });
		} else {
			throw new Error('Unsupported part type');
		}
	}
	return populated;
}
