# Pipeline `each` Functionality Implementation

## Overview

This implementation extends Pipelines to support running a step for every item in an array, or even every combination across multiple arrays, using the new optional `each` property on PipelineStep.

## How it Works

### YAML Configuration

The `each` property is an object where:
- **Keys** are the names of variables that will refer to items in the arrays
- **Values** are the names of variables that contain arrays

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
        outputAs: words
      # Lists all the generated words
      - prompt: >
          Write a one paragraph story using all these words:
          {{#each words}}
          {{this}}
          {{/each}}

tests:
  - vars:
      letters: ["B", "O", "Y"]
      types: ["noun", "verb"]
```

In this example:
- The first step will run 6 times (3 letters × 2 types = 6 combinations)
- Each execution gets variables `letter` and `type` set to specific values
- The `outputAs: words` creates an array containing all 6 results
- The second step receives this array and can use it in templates

## Implementation Details

### 1. Schema Updates

Added `each?: Record<string, string>` to the pipeline step schemas in:
- `src/lib/storage/types.ts` - File system schema validation
- `src/lib/types.ts` - Normalized pipeline step interface

### 2. Normalization

Updated `src/lib/storage/normalizeConfig.ts` to preserve the `each` property during normalization. The expansion happens at runtime when variable values are available.

### 3. Runtime Execution

Modified `src/lib/utils/PipelineEnvironment.ts` with:

#### `generateCombinations` function
Generates all possible combinations from the arrays specified in the `each` configuration:
- Takes the `each` config and current variables
- Validates that referenced variables are arrays
- Recursively generates all combinations
- Example: `{letter: "letters", type: "types"}` with `letters: ["A", "B"]` and `types: ["noun", "verb"]` produces:
  ```
  [
    {letter: "A", type: "noun"},
    {letter: "A", type: "verb"}, 
    {letter: "B", type: "noun"},
    {letter: "B", type: "verb"}
  ]
  ```

#### `runEachStep` function
Handles execution of steps with `each` property:
- Generates all combinations using `generateCombinations`
- Creates a separate step execution for each combination
- Runs all combinations in parallel using `Promise.all`
- Collects all outputs into an array
- Sets the `outputAs` variable to the combined array result
- Properly handles dependencies so subsequent steps wait for all combinations to complete

#### `safeRunStep` modification
Updated to detect steps with `each` property and route them to `runEachStep` instead of regular `runStep`.

## Key Features

### Combination Generation
- Supports single arrays: `{item: "items"}` 
- Supports multiple arrays: `{letter: "letters", type: "types"}`
- Generates Cartesian product of all arrays
- Validates that all referenced variables exist and are arrays

### Parallel Execution
- All combinations run in parallel for optimal performance
- Uses existing task queue infrastructure
- Proper error handling for individual combination failures

### Output Handling
- Individual results are collected into an array
- `outputAs` creates a variable containing all results
- Array can be used in subsequent steps with Handlebars templates
- Supports both string outputs and complex objects/files

### Dependency Management
- Steps depending on `each` steps wait for ALL combinations to complete
- Proper integration with existing pipeline dependency system
- Maintains execution order and prevents race conditions

## Example Use Cases

### Simple Array Iteration
```yaml
- each:
    item: items
  prompt: "Process {{item}}"
  outputAs: results
```

### Multiple Array Combinations
```yaml
- each:
    color: colors
    size: sizes
  prompt: "Describe a {{color}} {{size}} object"
  outputAs: descriptions
```

### With Dependencies
```yaml
- prompt: "Generate a list of categories"
  outputAs: categories
- each:
    category: categories
  prompt: "List 5 items in {{category}}"
  outputAs: categoryItems
```

## Error Handling

- Validates that `each` references exist and are arrays
- Throws descriptive errors for missing or invalid array references
- Handles individual combination failures gracefully
- Maintains pipeline error reporting with proper step identification

## Testing

Added test case in `src/lib/utils/PipelineEnvironment.test.ts` to verify that `each` properties are properly preserved in pipeline steps.

Example test configuration is available in `examples/pipeline/each-example.evals.yaml`.

## Future Enhancements

Potential improvements could include:
- Sequential execution option for memory-constrained scenarios
- Batch processing for very large combinations
- More sophisticated error handling and retry logic
- Progress reporting for long-running combinations