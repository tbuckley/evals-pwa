import { type MultiPartPrompt, type Prompt, type PromptFormatter, type VarSet } from '$lib/types';
import Handlebars from 'handlebars';
import { FileReference } from '$lib/storage/FileReference';
import { objectDfsMap } from './objectDFS';

export class HandlebarsPromptFormatter implements PromptFormatter {
	prompt: HandlebarsTemplateDelegate;

	constructor(prompt: Prompt) {
		this.prompt = Handlebars.compile(prompt);
	}
	format(vars: VarSet): MultiPartPrompt {
		const files: Record<string, File> = {};
		const placeholderVars = objectDfsMap(vars, (val, path) => {
			if (val instanceof FileReference) {
				if (val.type === 'image') {
					// Replace files with placeholders, which will be split out at the end
					files[path] = val.file;
					return `__FILE_PLACEHOLDER_${path}__`;
				} else {
					return val.uri;
				}
			}
			if (typeof val === 'string') {
				return new Handlebars.SafeString(val);
			}
			return val;
		});

		const rendered = this.prompt(placeholderVars);

		// Find all file placeholders, and use the image
		const parsed: MultiPartPrompt = [];
		rendered.split(/(__FILE_PLACEHOLDER_[a-zA-Z0-9_\-[\].$]+?__)/).forEach((part) => {
			if (part.startsWith('__FILE_PLACEHOLDER_')) {
				const key = part.slice(19, -2);
				parsed.push({ image: files[key] });
			} else if (part.length > 0) {
				parsed.push({ text: part });
			}
		});

		return parsed;
	}
}
