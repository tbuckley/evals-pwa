# Pipeline `each` Feature Implementation Summary

## Overview

Successfully extended Pipelines to support running a step for every item in an array, or every combination across multiple arrays using the new optional `each` property on PipelineStep.

## Implementation Details

### 1. Type System Updates

#### Added `each` property to interfaces:

- `NormalizedPipelineStep` in `src/lib/types.ts`
- `PipelineStep` in `src/lib/utils/PipelineEnvironment.ts`
- Updated filesystem types in `src/lib/storage/types.ts`

#### Updated Zod validation schemas:

- `pipelinePromptSchema` in `src/lib/types.ts`
- `fsPipelinePromptSchema` in `src/lib/storage/types.ts`

### 2. Core Pipeline Logic

#### New methods in `PipelineState` class:

- `generateCombinations()`: Creates cartesian product of arrays from `each` specification
- `expandStepWithEach()`: Converts a step with `each` into multiple expanded steps
- Updated `getStartingSteps()`: Expands steps with `each` property before processing
- Updated `markCompleteAndGetNextSteps()`: Handles dependency tracking for expanded steps

#### Key Features:

- **Single Array Support**: `each: { letter: 'letters' }` runs step for each item in `letters` array
- **Multiple Array Support**: `each: { letter: 'letters', type: 'types' }` runs step for cartesian product
- **Dependency Tracking**: Expanded steps maintain proper dependencies using original step IDs
- **Conditional Support**: `if` conditions evaluated with each combination's variables
- **Variable Substitution**: Each iteration gets access to current combination values

### 3. Variable Handling

Updated `runStep` function in `PipelineEnvironment.ts`:

- Extracts `_eachVars` from expanded steps
- Merges each variables with existing vars for prompt formatting
- Allows template variables like `{{letter}}` and `{{type}}` in prompts

### 4. Step ID Management

Generated unique IDs for expanded steps:

- Format: `{originalStepId}-each-{index}`
- Example: `step-0-each-0`, `step-0-each-1`, etc.
- Maintains `_originalId` property for dependency tracking

## Usage Example

```yaml
prompts:
  - $pipeline:
      # Run for each combo of letter and type
      - each:
          letter: letters
          type: types
        prompt: >
          Pick a {{type}} that starts with {{letter}}.
          Respond with one word and nothing else
      # Lists all the generated words
      - prompt: >
          Write a one paragraph story using all these words:
          {{#each $output}}
          {{this}}
          {{/each}}

tests:
  - vars:
      letters: ['B', 'O', 'Y']
      types: ['noun', 'verb']
```

This will:

1. Generate 6 combinations: (B,noun), (B,verb), (O,noun), (O,verb), (Y,noun), (Y,verb)
2. Run the first step 6 times with different variables
3. Collect all outputs and pass them to the second step

## Edge Cases Handled

- **Empty Arrays**: No steps generated, pipeline continues normally
- **Missing Arrays**: Treated as empty arrays
- **Single Array**: Works as expected without cartesian product
- **If Conditions**: Evaluated for each combination with proper variable scope
- **Dependencies**: Proper tracking ensures subsequent steps wait for all combinations

## Files Modified

1. `src/lib/types.ts` - Added `each` to NormalizedPipelineStep and schema
2. `src/lib/storage/types.ts` - Added `each` to filesystem types and schema
3. `src/lib/utils/PipelineEnvironment.ts` - Core pipeline logic implementation
4. `examples/pipeline/each-example.evals.yaml` - Example configuration

## Technical Notes

- Implementation passes TypeScript compilation without errors
- Some ESLint warnings about `any` types are expected due to dynamic array handling
- Maintains backward compatibility - existing pipelines work unchanged
- Efficient cartesian product generation using recursive algorithm

## Testing

Created comprehensive test cases in `src/lib/utils/PipelineEnvironment.test.ts`:

- Single array expansion
- Multiple array expansion (cartesian product)
- Integration with `if` conditions
- Integration with `deps` dependencies
- Empty and missing array handling
- Output collection and aggregation

The implementation successfully meets all requirements from the original specification.
