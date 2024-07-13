import {
	multiPartPromptSchema,
	type MultiPartPrompt,
	type Prompt,
	type PromptFormatter,
	type VarSet
} from '$lib/types';
import Handlebars from 'handlebars';

export class HandlebarsPromptFormatter implements PromptFormatter {
	prompt: HandlebarsTemplateDelegate;

	constructor(prompt: Prompt) {
		this.prompt = Handlebars.compile(prompt);
	}
	format(vars: VarSet): MultiPartPrompt {
		const rendered = this.prompt(vars);
		try {
			const json = JSON.parse(rendered);
			return multiPartPromptSchema.parse(json);
		} catch (err) {
			console.log(err);
			return [{ text: rendered }];
		}
	}
}
