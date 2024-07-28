import {
	multiPartPromptSchema,
	type MultiPartPrompt,
	type Prompt,
	type PromptFormatter,
	type VarSet
} from '$lib/types';
import Handlebars from 'handlebars';
import { convertAllStringsToHandlebarSafe } from './handlebars';

export class HandlebarsPromptFormatter implements PromptFormatter {
	prompt: HandlebarsTemplateDelegate;

	constructor(prompt: Prompt) {
		this.prompt = Handlebars.compile(prompt);
	}
	format(vars: VarSet): MultiPartPrompt {
		// Indicate that all strings are safe, otherwise they will be escaped
		const safeVars = convertAllStringsToHandlebarSafe(vars);
		const rendered = this.prompt(safeVars);
		try {
			const json = JSON.parse(rendered);
			return multiPartPromptSchema.parse(json);
		} catch {
			return [{ text: rendered }];
		}
	}
}
