import { type MultiPartPrompt, type Prompt, type PromptFormatter, type VarSet } from '$lib/types';
import Handlebars from 'handlebars';
import { FileReference } from '$lib/storage/FileReference';

export class HandlebarsPromptFormatter implements PromptFormatter {
	prompt: HandlebarsTemplateDelegate;

	constructor(prompt: Prompt) {
		this.prompt = Handlebars.compile(prompt);
	}
	format(vars: VarSet): MultiPartPrompt {
		const files: Record<string, File> = {};
		const placeholderVars = objectDfsMap(vars, (val, path) => {
			if (val instanceof FileReference) {
				// Replace files with placeholders, which will be split out at the end
				files[path] = val.file;
				return `__FILE_PLACEHOLDER_${path}__`;
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

function objectDfsMap(
	val: unknown,
	map: (val: unknown, path: string) => unknown,
	path = '$'
): unknown {
	if (Array.isArray(val)) {
		return val.map((v, i) => objectDfsMap(v, map, path + '[' + i + ']'));
	}
	if (typeof val === 'object' && val !== null && Object.getPrototypeOf(val) === Object.prototype) {
		const obj: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(val)) {
			obj[key] = objectDfsMap(value as unknown, map, path + '.' + key);
		}
		return obj;
	}
	return map(val, path);
}
