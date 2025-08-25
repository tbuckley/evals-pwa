# Config Example

This is an example of a config containing all possible properties:

```yaml
# Optional: description of the test
description: A human-readable description

providers:
  - gemini:gemini-2.5-pro # A simple model
  - id: gemini:gemini-2.5-pro
    labels:
      - strong # Optional labels if you want to limit which models run which prompts
    config: # Optional configuration options, usually passed directly to the model request
      # NOTE: these are only valid for Gemini!
      generationConfig:
        thinkingConfig:
          includeThoughts: true
          thinkingBudget: 1000

prompts:
  - 'A simple one-line prompt referencing a variable {{foo}}'
  - |
    A multi-line prompt.
    Newlines are preserved.
  - >
    A multi-line prompt where
    newlines are ignored so you
    can write across lines.

    Use double-newlines for paragraphs.
  - prompt: 'An expanded one-line prompt referencing a variable {{foo}}'
    providerLabel: strong # Optionally limit this prompt to only providers with this label
  # Optionally specify a conversational prompt with system/user/assistant messages
  - - system: 'A system prompt'
    - user: 'A user prompt'
    - assistant: 'An assistant prompt'
    - user: 'A final user prompt referencing {{foo}}'
  - $pipeline:
      - 'A prompt that runs first' # Could be a string or a conversational prompt
      - id: Step title # Optional: Appears in the UI, must be unique for each step
        prompt: 'A prompt that runs second' # Could be a string or a conversational prompt
        providerLabel: strong # Optional: limit this step to only providers with this label
        outputAs: bar # Optional: save the output to this var name
        deps: ['var'] # Optional: Vars that must complete before this step will trigger
        if: function execute(vars) {return true;} # Optional: test to see if this step should run
        session: my session # Optional: save the conversation history for future prompts
  # Reference prompts in other files
  - file:///path/to/prompt.txt
  - file://./relative/path/to/prompt.txt
  - file:///prompts/*.txt # Include any matching files

tests: # Optional; no tests will just run the prompts as-is
  - description: An optional description for the test

    # Optional settings
    repeat: 3 # Repeat this test 3 times
    only: true # Only run this test (and other tests marked with only:true)

    # Add vars/assertions to all tests
    vars:
      foo: A var that will be applied to all tests
    assert:
      type: equals
      vars:
        value: the expected output

# Optional: settings to apply to all tests
defaultTest:
  description: An optional description for the test
  repeat: 3 # Repeat all tests 3 times
  # Add vars/assertions to all tests
  vars:
    foo: A var that will be applied to all tests
  assert:
    type: llm-rubric
    vars:
      rubric: responds positively

# Optional: global settings
options:
  maxConcurrency: 10 # Maximum number of tests to run in parallel; defaults to Infinity
```
