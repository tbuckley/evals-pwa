import type { Assertion, AssertionProvider, NormalizedTestCase } from '$lib/types';
import { createContainsAssertion } from './contains';
import { createJavascriptAssertion } from './javascript';
import Handlebars from 'handlebars';
import { createRegexAssertion } from './regex';
import { createEqualsAssertion } from './equals';
import { createLlmRubricAssertion } from './llmRubric';
import type { ProviderManager } from '$lib/providers/ProviderManager';
import { objectDfsMap } from '$lib/utils/objectDFS';
import { createSelectBestAssertion } from './selectBest';
import { createConsistencyAssertion } from './consistency';

export class AssertionManager {
  assertions: AssertionProvider[] = [];

  constructor(
    public providerManager: ProviderManager,
    private abortSignal: AbortSignal,
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
    testVars: NormalizedTestCase['vars'],
  ): AssertionProvider {
    if (type === 'equals') {
      const populatedVars = prePopulateVars(vars, testVars);
      return createEqualsAssertion(populatedVars);
    } else if (type === 'contains') {
      const populatedVars = prePopulateVars(vars, testVars);
      return createContainsAssertion(populatedVars);
    } else if (type === 'regex') {
      const populatedVars = prePopulateVars(vars, testVars);
      return createRegexAssertion(populatedVars);
    } else if (type === 'javascript') {
      return createJavascriptAssertion(vars, testVars);
    } else if (type === 'llm-rubric') {
      return createLlmRubricAssertion(vars, testVars, this.providerManager, this.abortSignal);
    } else if (type === 'select-best') {
      return createSelectBestAssertion(vars, testVars, this.providerManager, this.abortSignal);
    } else if (type === 'consistency') {
      return createConsistencyAssertion(vars, testVars, this.providerManager, this.abortSignal);
    } else {
      throw new Error(`Unknown assertion type: ${type}`);
    }
  }
}

function prePopulateVars(vars: Assertion['vars'], testVars: NormalizedTestCase['vars']) {
  const populatedVars = { ...vars };
  const safeVars = objectDfsMap(testVars, (val) => {
    if (typeof val === 'string') {
      return new Handlebars.SafeString(val);
    }
    return val;
  });

  for (const key in populatedVars) {
    if (typeof populatedVars[key] === 'string') {
      const template = Handlebars.compile(populatedVars[key]);
      populatedVars[key] = template(safeVars);
    }
  }

  return populatedVars;
}
