import type { Assertion, AssertionProvider, TestCase } from '$lib/types';
import { convertAllStringsToHandlebarSafe } from '$lib/utils/handlebars';
import { createContainsAssertion } from './contains';
import { createJavascriptAssertion } from './javascript';
import Handlebars from 'handlebars';
import { createRegexAssertion } from './regex';
import { createEqualsAssertion } from './equals';

export class AssertionManager {
	assertions: AssertionProvider[] = [];

	getAssertion(assertion: Assertion, testVars: TestCase['vars']): AssertionProvider {
		const provider = createAssertion(assertion.type, assertion.vars, testVars);
		this.assertions.push(provider);
		return provider;
	}
	destroy() {
		for (const assertion of this.assertions) {
			assertion.destroy?.();
		}
	}
}

function createAssertion(
	type: string,
	vars: Assertion['vars'],
	testVars: TestCase['vars']
): AssertionProvider {
	const populatedVars = { ...vars };
	const safeVars = convertAllStringsToHandlebarSafe(testVars ?? {});
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
		default:
			throw new Error(`Unknown assertion type: ${type}`);
	}
}
