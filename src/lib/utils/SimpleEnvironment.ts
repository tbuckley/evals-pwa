import type {
	TestEnvironment,
	ModelProvider,
	TestOutput,
	PromptFormatter,
	VarSet,
	FileLoader,
	TokenUsage,
	PopulatedVarSet
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
		const populatedVars = await populate(vars, this.loader);
		const prompt = this.prompt.format(populatedVars);

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

async function populate(vars: VarSet, loader: FileLoader): Promise<PopulatedVarSet> {
	const populated: PopulatedVarSet = {};
	for (const key in vars) {
		if (vars[key].startsWith('file:///') && isSupportedImageType(vars[key])) {
			populated[key] = await loader.loadFile(vars[key]);
		} else {
			populated[key] = vars[key];
		}
	}
	return populated;
}

function isSupportedImageType(path: string): boolean {
	return path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.jpeg');
}
