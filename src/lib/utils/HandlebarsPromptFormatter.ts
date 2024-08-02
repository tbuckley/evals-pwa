import {
	type MultiPartPrompt,
	type PopulatedVarSet,
	type Prompt,
	type PromptFormatter
} from '$lib/types';
import Handlebars from 'handlebars';
import { convertAllStringsToHandlebarSafe } from './handlebars';

export class HandlebarsPromptFormatter implements PromptFormatter {
	prompt: HandlebarsTemplateDelegate;

	constructor(prompt: Prompt) {
		this.prompt = Handlebars.compile(prompt);
	}
	format(vars: PopulatedVarSet): MultiPartPrompt {
		// Replace files with placeholders, which will be split out at the end
		const placeholderVars: Record<string, unknown> = { ...vars };
		const files: Record<string, File> = {};
		for (const key in placeholderVars) {
			if (placeholderVars[key] instanceof File) {
				files[key] = placeholderVars[key];
				placeholderVars[key] = `__FILE_PLACEHOLDER_${key}__`;
			}
		}

		// Indicate that all strings are safe, otherwise they will be escaped
		const safeVars = convertAllStringsToHandlebarSafe(placeholderVars);

		const rendered = this.prompt(safeVars);

		// Find all file placeholders, and use the image
		const parsed: MultiPartPrompt = [];
		rendered.split(/(__FILE_PLACEHOLDER_[a-zA-Z0-9_-]+__)/).forEach((part) => {
			if (part.startsWith('__FILE_PLACEHOLDER_')) {
				const key = part.slice(19, -2);
				parsed.push({ image: files[key] });
			} else {
				parsed.push({ text: part });
			}
		});

		return parsed;
	}
}
