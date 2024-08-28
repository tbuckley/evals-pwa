import type { Assertion, AssertionProvider, FileLoader, NormalizedTestCase } from '$lib/types';
import { convertAllStringsToHandlebarSafe } from '$lib/utils/handlebars';
import { createContainsAssertion } from './contains';
import { createJavascriptAssertion } from './javascript';
import Handlebars from 'handlebars';
import { createRegexAssertion } from './regex';
import { createEqualsAssertion } from './equals';
import { createLlmRubricAssertion } from './llmRubric';
import type { ProviderManager } from '$lib/providers/ProviderManager';

export class AssertionManager {
	assertions: AssertionProvider[] = [];

	constructor(
		public providerManager: ProviderManager,
		public fileLoader: FileLoader
	) {}

	getAssertion(assertion: Assertion, testVars: NormalizedTestCase['vars']): AssertionProvider {
		const provider = this.createAssertion(assertion.type, assertion.vars, testVars);
		this.assertions.push(provider);
		return provider;
	}
	destroy() {
		for (const assertion of this.assertions) {
			assertion.destroy?.();
		}
	}

	private createAssertion(
		type: string,
		vars: Assertion['vars'],
		testVars: NormalizedTestCase['vars']
	): AssertionProvider {
		const populatedVars = { ...vars };
		const safeVars = convertAllStringsToHandlebarSafe(testVars ?? {});
		// For llmRubric, ensure {{ output }} is still in the result...
		// Though this will break for any functions :-/
		// TODO fix
		if (!('output' in safeVars)) {
			safeVars['output'] = new Handlebars.SafeString('{{ output }}');
		}
		if (!('rubric' in safeVars)) {
			safeVars['rubric'] = new Handlebars.SafeString('{{ rubric }}');
		}
		for (const key in populatedVars) {
			if (typeof populatedVars[key] === 'string') {
				const template = Handlebars.compile(populatedVars[key]);
				populatedVars[key] = template(safeVars);
			}
		}

		switch (type) {
			case 'equals':
				return createEqualsAssertion(populatedVars);
			case 'contains':
				return createContainsAssertion(populatedVars);
			case 'regex':
				return createRegexAssertion(populatedVars);
			case 'javascript':
				return createJavascriptAssertion(populatedVars);
			case 'llm-rubric':
				return createLlmRubricAssertion(populatedVars, this.providerManager);
			default:
				throw new Error(`Unknown assertion type: ${type}`);
		}
	}
}
