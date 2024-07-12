import type { Prompt, PromptFormatter, VarSet } from '$lib/types';
import Handlebars from 'handlebars';

export class HandlebarsPromptFormatter implements PromptFormatter {
	prompt: HandlebarsTemplateDelegate;

	constructor(prompt: Prompt) {
		this.prompt = Handlebars.compile(prompt);
	}
	format(vars: VarSet): string {
		return this.prompt(vars);
	}
}
