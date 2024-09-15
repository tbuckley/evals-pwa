import { type MultiPartPrompt, type Prompt, type PromptFormatter, type VarSet } from '$lib/types';
import Handlebars from 'handlebars';
import { FileReference } from '$lib/storage/FileReference';
import { asyncObjectDfsMap } from './objectDFS';

export class HandlebarsPromptFormatter implements PromptFormatter {
	prompt: HandlebarsTemplateDelegate;

	constructor(prompt: Prompt) {
		this.prompt = Handlebars.compile(prompt);
	}
	async format(vars: VarSet, mimeTypes?: string[]): Promise<MultiPartPrompt> {
		const files: Record<string, FileReference> = {};
		const errorFiles: Record<string, FileReference> = {};
		const placeholderVars = await asyncObjectDfsMap(vars, async (val, path) => {
			if (val instanceof FileReference) {
				if (mimeTypes && mimeTypes.includes(val.file.type)) {
					// Replace files with placeholders, which will be split out at the end
					files[path] = val;
					return `__FILE_PLACEHOLDER_${path}__`;
				} else {
					// Try reading the file as a utf-8 string
					try {
						const decoder = new TextDecoder('utf-8', { fatal: true });
						const decodedText = decoder.decode(await val.file.arrayBuffer());
						return new Handlebars.SafeString(decodedText);
					} catch (e) {
						console.warn(`Cannot read file ${val.uri} (for ${path}) as utf-8:`, e);
						errorFiles[path] = val;
						return `__FILE_PLACEHOLDER_${path}__`;
					}
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
				if (key in errorFiles) {
					throw new Error(`Cannot read file ${errorFiles[key].uri}: unsupported file type`);
				}
				parsed.push({ file: files[key].file });
			} else if (part.length > 0) {
				parsed.push({ text: part });
			}
		});

		return parsed;
	}
}
