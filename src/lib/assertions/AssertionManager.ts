import type { Assertion, AssertionProvider } from '$lib/types';
import { createIContainsAssertion } from './icontains';
import { createJavascriptAssertion } from './javascript';

export class AssertionManager {
	getAssertion(assertion: Assertion): AssertionProvider {
		switch (assertion.type) {
			case 'icontains':
				return createIContainsAssertion(assertion.vars);
			case 'javascript':
				return createJavascriptAssertion(assertion.vars);
			default:
				throw new Error(`Unknown assertion type: ${assertion.type}`);
		}
	}
}
