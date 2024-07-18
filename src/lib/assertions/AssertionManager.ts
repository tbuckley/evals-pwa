import type { Assertion, AssertionProvider } from '$lib/types';
import { createIContainsAssertion } from './icontains';
import { createJavascriptAssertion } from './javascript';

export class AssertionManager {
	assertions: AssertionProvider[] = [];

	getAssertion(assertion: Assertion): AssertionProvider {
		const provider = createAssertion(assertion);
		this.assertions.push(provider);
		return provider;
	}
	destroy() {
		for (const assertion of this.assertions) {
			assertion.destroy?.();
		}
	}
}

function createAssertion(assertion: Assertion): AssertionProvider {
	switch (assertion.type) {
		case 'icontains':
			return createIContainsAssertion(assertion.vars);
		case 'javascript':
			return createJavascriptAssertion(assertion.vars);
		default:
			throw new Error(`Unknown assertion type: ${assertion.type}`);
	}
}
