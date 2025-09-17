import { toCodeReference, type CodeReference } from '$lib/storage/CodeReference';
import type { VarSet } from '$lib/types';

export interface PipelineStep {
  id: string;
  deps?: string[];
  if?: string | CodeReference;
  outputAs?: string;
}

interface StepDepsStatus<S> {
  steps: Map<string, S>;
  originalSteps: string[];
  outputs: Map<string, S>;
  originalOutputs: string[];
}

function createStepDepsStatus<S>(stepIds: string[], outputs: string[]): StepDepsStatus<S> {
  return {
    steps: new Map(),
    originalSteps: stepIds,
    outputs: new Map(),
    originalOutputs: outputs,
  };
}

export class PipelineState<T extends PipelineStep, S> {
  stepIdMap: Map<string, T> = new Map<string, T>();

  stepDepsStatus: Map<string, StepDepsStatus<S>> = new Map<string, StepDepsStatus<S>>();
  stepDepToIds: Map<string, string[]> = new Map<string, string[]>();
  outputDepToIds: Map<string, string[]> = new Map<string, string[]>();
  spoofStepIdMap: Map<string, string> = new Map<string, string>();

  contextMerge: (a: S, b: S) => S;

  constructor(steps: T[], contextMerge: (a: S, b: S) => S) {
    this.contextMerge = contextMerge;

    // Register step dependencies
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step.deps) {
        // The first step becomes a starting state, other steps depend on the previous
        const prevStepId = i > 0 ? [steps[i - 1].id] : [];
        this.stepDepsStatus.set(step.id, createStepDepsStatus(prevStepId, []));
        for (const dep of prevStepId) {
          const ids = this.stepDepToIds.get(dep) ?? [];
          ids.push(step.id);
          this.stepDepToIds.set(dep, ids);
        }
      } else {
        // Register deps as output dependencies
        this.stepDepsStatus.set(step.id, createStepDepsStatus([], step.deps));
        for (const dep of step.deps) {
          const ids = this.outputDepToIds.get(dep) ?? [];
          ids.push(step.id);
          this.outputDepToIds.set(dep, ids);
        }
      }
    }

    // Validate that all steps have unique IDs
    const uniqueIds = new Set(steps.map((step) => step.id));
    if (uniqueIds.size !== steps.length) {
      throw new Error('Steps have duplicate IDs');
    }

    this.stepIdMap = new Map<string, T>(steps.map((step) => [step.id, step]));
  }

  registerStep(step: T) {
    if (this.stepIdMap.has(step.id)) {
      throw new Error(`Step ${step.id} already registered`);
    }
    this.stepIdMap.set(step.id, step);

    if (!step.deps) {
      throw new Error('Cannot late-register a step with no dependencies');
    }

    this.stepDepsStatus.set(step.id, createStepDepsStatus([], step.deps));
    for (const dep of step.deps) {
      const ids = this.outputDepToIds.get(dep) ?? [];
      ids.push(step.id);
      this.outputDepToIds.set(dep, ids);
    }
  }

  getStatus() {
    return [...this.stepDepsStatus.entries()];
  }

  private getStepsWithNoDeps(): T[] {
    return [...this.stepIdMap.values()].filter((step) => {
      const deps = this.stepDepsStatus.get(step.id);
      if (!deps) {
        throw new Error(`Dependencies for step ${step.id} not found`);
      }
      return (
        deps.steps.size === deps.originalSteps.length &&
        deps.outputs.size === deps.originalOutputs.length
      );
    });
  }

  private async testStep(step: T, vars: VarSet): Promise<boolean> {
    if (!step.if) {
      return true;
    }

    // Evaluate the if statement
    const code = await toCodeReference(step.if);
    const execute = await code.bind();
    const result = await execute(vars);
    if (typeof result !== 'boolean') {
      throw new Error(`Step ${step.id} if statement returned non-boolean`);
    }
    return result;
  }

  private markStepAsComplete(
    stepId: string,
    context: S,
  ): { next: { step: T; context: S }[]; numDeps: number } {
    const next: { step: T; context: S }[] = [];
    let numDeps = 0;
    this.stepDepToIds.get(stepId)?.forEach((id) => {
      numDeps += 1;
      const stepStatus = this.stepDepsStatus.get(id);
      if (!stepStatus) {
        throw new Error(`Dependencies for step ${id} not found`);
      }
      stepStatus.steps.set(stepId, context);
      if (
        stepStatus.steps.size === stepStatus.originalSteps.length &&
        stepStatus.outputs.size === stepStatus.originalOutputs.length
      ) {
        const step = this.stepIdMap.get(id);
        if (!step) {
          throw new Error(`Step ${id} not found`);
        }
        const context = [...stepStatus.steps.values(), ...stepStatus.outputs.values()].reduce(
          this.contextMerge,
        );
        next.push({ step, context });
      }
    });
    return { next, numDeps };
  }

  private markOutputAsComplete(
    outputAs: string,
    context: S,
  ): { next: { step: T; context: S }[]; numDeps: number } {
    const next: { step: T; context: S }[] = [];
    let numDeps = 0;
    this.outputDepToIds.get(outputAs)?.forEach((id) => {
      numDeps += 1;
      const stepStatus = this.stepDepsStatus.get(id);
      if (!stepStatus) {
        throw new Error(`Dependencies for step ${id} not found`);
      }
      stepStatus.outputs.set(outputAs, context);
      if (
        stepStatus.steps.size === stepStatus.originalSteps.length &&
        stepStatus.outputs.size === stepStatus.originalOutputs.length
      ) {
        const step = this.stepIdMap.get(id);
        if (!step) {
          throw new Error(`Step ${id} not found`);
        }
        const context = [...stepStatus.steps.values(), ...stepStatus.outputs.values()].reduce(
          this.contextMerge,
        );
        next.push({ step, context });
      }
    });
    return { next, numDeps };
  }

  async getStartingSteps(latestVars: VarSet, initialContext: S): Promise<T[]> {
    // Include any steps that have no dependencies
    const candidates = this.getStepsWithNoDeps();

    // Include any steps triggered by the initial vars
    for (const varName in latestVars) {
      const res = this.markOutputAsComplete(varName, initialContext);
      candidates.push(...res.next.map(({ step }) => step));
    }

    const validSteps = await Promise.all(
      candidates.map(async (step) => ({
        step,
        valid: await this.testStep(step, latestVars),
      })),
    );
    return validSteps.filter((result) => result.valid).map((result) => result.step);
  }

  async markCompleteAndGetNextSteps(
    step: T,
    latestVars: VarSet,
    context: S,
  ): Promise<{ isLeaf: boolean; next: { step: T; context: S }[] }> {
    const nextSteps: { step: T; context: S }[] = [];
    let numDeps = 0;

    // Mark any dependencies on this step ID as complete
    const res = this.markStepAsComplete(step.id, context);
    nextSteps.push(...res.next);
    numDeps += res.numDeps;

    // Mark any dependencies on this step output as complete
    if (step.outputAs) {
      const res = this.markOutputAsComplete(step.outputAs, context);
      nextSteps.push(...res.next);
      numDeps += res.numDeps;
    }

    // Reset the statuses for any steps
    nextSteps.forEach(({ step }) => {
      const stepStatus = this.stepDepsStatus.get(step.id);
      if (stepStatus) {
        stepStatus.steps = new Map();
        stepStatus.outputs = new Map();
      }
    });

    // Check that all steps are available with if statements
    const nextStepsValid = await Promise.all(
      nextSteps.map(async (step) => ({
        step,
        valid: await this.testStep(step.step, latestVars),
      })),
    );
    const availableSteps = nextStepsValid
      .filter((result) => result.valid)
      .map((result) => result.step);

    const isLeaf = numDeps === 0 || (numDeps === nextSteps.length && availableSteps.length === 0);

    return { isLeaf, next: availableSteps };
  }
}
