# Documentation

A [Promptfoo](https://www.promptfoo.dev/docs/intro)-inspired evaluation framework for AI prompts. There is no cloud backend, so all your data stays on your device -- prompts run directly against the Gemini/etc backends. It's free (ignoring LLM costs), private, and requires no installation.

## Table of Contents

## Getting Started

_**Want AI to write your evals?** Check out [our llms.txt](/llms.txt). You can copy it into your favorite chatbot to have it generate new evals, answer questions about how it works, or help debug an issue._

First, create a folder where your evaluation data and output will be stored. Create an `evals.yaml` file inside it and add the following:

```yaml
# An optional short description to help identify outputs
description: My first eval

# One or more prompts you are testing
prompts:
  - 'Respond like a pirate to this request: {{request}}'
  - 'Respond with a haiku to this request: {{request}}'

# One or more LLMs you want to use for running the prompts
providers:
  - gemini:gemini-2.5-pro
  - openai:gpt-4o

# Tests provide values to feed into the prompts, and
# checks to make sure the output is right
tests:
  - description: foo
    vars:
      request: Who was the first US president?
    assert:
      - type: contains
        vars:
          needle: washington
          ignoreCase: true
```

**Not familiar with YAML?** It is a markup language, with a similar structure to JSON but easier to read and write. See the [YAML spec](https://yaml.org/). Our configuration files mostly follow the Promptfoo format, with some minor differences.

Next, click "Choose a folder" in the header and select your folder. You will then be prompted (ha) to add any API keys or other environment variables for your chosen providers. (Note: These keys will be saved locally in your browser's storage. You can edit them from the settings icon in the top-right.)

Finally, click "Run tests" on the Dashboard page. Results will stream in and assertions will be checked to show the pass/fail rate.

## Configuration Format

### Providers

Format:

```typescript
interface Config {
  providers: Provider[];
  config?: any;
  // ...
}
type Provider = string | { id: string; config?: any; labels?: string[] };
```

Currently supported model providers:

- [x] Gemini -- prefix with `gemini:`, e.g. `gemini:gemini-2.5-pro`. Requires `GEMINI_API_KEY` in your environment.
- [x] OpenAI -- prefix with `openai:`, e.g. `openai:gpt-4o`. Requires `OPENAI_API_KEY` in your environment.
- [x] [Chrome](https://goo.gle/chrome-ai-dev-preview) -- use `chrome:ai`.
- [x] Ollama -- prefix with `ollama:`, e.g. `ollama:gemma-2:2b`. Requires `OLLAMA_ENDPOINT` (e.g. `http://localhost:11434`) in your environment, or the `apiBaseUrl` config option.
- [x] [WebLLM](https://github.com/mlc-ai/web-llm) -- prefix with `web-llm:`, e.g. `web-llm:gemma-2-2b-it-q4f32_1-MLC`. See [here](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts#L309) for a list of supported model IDs. Requires [WebGPU](https://caniuse.com/webgpu).
- [x] Anthropic -- prefix with `anthropic:`, e.g. `anthropic:claude-3-5-sonnet-latest`. Requires `ANTHROPIC_API_KEY` in your environment.
- [x] DALL-E -- prefix with `dalle:`, e.g. `dalle:dall-e-3`. Requires `OPENAI_API_KEY` in your environment. Output is an array containing an image. View a result's details to see the revised prompt DALL-E creates. Also supports the new `gpt-image-1` model. If images are included in the prompt, it will edit them; though note that while `gpt-image-*` supports multiple images, `dall-e-2` only supports 1.
- [x] ComfyUI -- prefix with `comfyui:`, e.g. `comfyui:comfyui`. Requires `config.apiBaseUrl` with URL to the ComfyUI server. Run the server with `python main.py --enable-cors-header` for access from any origin, see [Github PR](https://github.com/comfyanonymous/ComfyUI/pull/413). From ComfyUI, choose "Workflow > Export (API)" to get a version that works with this tool.

#### Provider Config

When providers are defined in the expanded form, additional configuration options can be specified:

```yaml
providers:
  - id: ollama:llama3:8b
    config:
      apiBaseUrl: http://localhost:11434
      response_format: { type: 'json_object' }
  - id: gemini:gemini-2.5-flash
    config:
      generationConfig:
        responseMimeType: application/json
```

You may also specify a `mimeTypes: string[]` in the `config` to override the model's default supported mime-types.

```yaml
providers:
  - id: ollama:llama3:8b
    config:
      mimeTypes: ['image/png']
```

**Gemini Config**

Any config will be included as additional properties in the API request. See <https://ai.google.dev/api/generate-content#request-body>

For Gemini 2.0 Flash image generation (currently experimental as of 2025-04-02), you can enable it with the following config:

```yaml
providers:
  - id: gemini:gemini-2.0-flash-exp-image-generation
    config:
      generationConfig:
        responseModalities: ['Text', 'Image']
```

**OpenAI Config**

- `apiBaseUrl` -- the base for the API endpoint, default: `https://api.openai.com`
- `...` -- additional properties to include in the API request, see <https://platform.openai.com/docs/api-reference/chat/completions>

**Ollama Config**

Equivalent to OpenAI Config.

#### Labels

Labels are used to limit providers to a subset of prompts.

With pipelines, you can specify a `providerLabel` to limit which providers can run that step. Every possible permutation of providers that meets the needs of the pipeline will be run.

### Prompts

Format:

```typescript
type Prompt =
  | string
  | ConversationPrompt[]
  | { prompt: string | ConversationPrompt[]; providerLabel?: string };
type ConversationPrompt = { system: string } | { user: string } | { assistant: string };
interface Config {
  prompts: Prompt[];
  // ...
}
```

`prompts` is an array of prompts. Prompts use [Handlebars](https://handlebarsjs.com/) format (unlike Promptfoo's nunjucks). Test case variables are all considered "safe" strings and will not be escaped.

A prompt variable may also be substituted with a file, depending on what the provider supports. For example, Gemini models support PDF and various image, video, and audio formats.

To include system instructions or simulate a conversation, you can specify roles. Note that the prompt is still just a string, but it contains valid yaml; this approach supports iterating over a set of messages if desired.

```yaml
prompts:
  - - system: You are {{persona}} named {{name}}.
    - user: What is your name?
    - assistant: I am {{name}}.
    - user: Where do you live?
  - |- # We use the yaml pipe to make this a string, so we can use the handlebars `#each` at the top level
    - system: You are {{persona}} named {{name}}.
    {{#each messages}}
    - user: {{this.prompt}}
    - assistant: {{this.response}}
    {{/each}}
    - user: What is your name?
```

Multi-role prompts are currently only supported for Gemini, OpenAI, and Anthropic models.

#### Pipelines (Advanced)

A prompt can alternatively be a pipeline, running multiple prompts together with a single output. This is an advanced feature that unlocks a lot of capabilities.

```typescript
interface Pipeline {
  $pipeline: (string | PipelinePrompt)[];
}
interface PipelinePrompt {
  prompt: string;
  providerLabel?: string;
  // New for pipelines
  id?: string; // Just for display
  outputAs?: string; // Assign the output to a var
  deps?: string[]; // Dependencies (var names)
  if?: string | CodeReference; // Test if this step should run
}
```

The most basic version of a pipeline is a set of prompts that run one after another:

```yaml
prompts:
  - $pipeline:
      - What is the capital city of {{country}}?
      - How many people live in the city {{$output}}?
```

This will run each prompt one after the other. Each prompt will get access to the previous prompt's output as the `$output` variable as well as the full history of prompts and their outputs as the `$history` variable. You will be able to see the output of each step in the runs table.

```typescript
type Output = string | (string | File)[];
type History = { prompt: ConversationPrompt; output: Output }[];
```

You can alternatively use an object for pipeline steps (see `PipelinePrompt` above). As with normal prompts, this object lets you indicate which provider labels can run it; unlike normal prompts, a pipeline may use labels to specify multiple models that should be used. The pipeline will be tested against every valid combination of providers.

Pipeline prompt objects have additional options that let you create more complex workflows. The simplest of these options are `id`, which lets you provide a descriptive name for the step in the table, and `outputAs`, which lets you assign the output to a specific variable name.

```yaml
prompts:
  - $pipeline:
      - prompt: What is the capital city of {{country}}?
        outputAs: city
      - How many people live in the city {{city}}?
```

Now that we can name outputs with `outputAs`, you can also specify dependencies for your prompt as a list of var names using `deps: string[]`. Your prompt will run whenever those vars are updated. Picture this as a graph, with prompts as nodes and `deps` specifying the edges.

If a prompt has no dependencies (or all its dependencies are specified by a test), it will run immediately. Prompts with dependencies run once all of them are generated; and they only re-run if all of the deps are updated again. One use case for this is running multiple steps in parallel, then having one prompt depend on all of them. For example, a judge that chooses the best of multiple options. _Note: it's important that your graph always end up with all paths leading to a single result._

```yaml
prompts:
  - $pipeline:
      - deps: []
        prompt: Write a haiku.
        providerLabel: provider-a
        outputAs: aHaiku
      - deps: []
        prompt: Write a haiku.
        providerLabel: provider-b
        outputAs: bHaiku
      - deps: ['aHaiku', 'bHaiku']
        prompt: |
          Which of these haikus is better?
          Option A:
          {{aHaiku}}
          Option B:
          {{bHaiku}}
        providerLabel: provider-judge
```

Finally, you can also create loops by having a prompt depend on a variable that is output later. But in order to exit the loop, you need a way to run conditions. The `if` option lets you specify JavaScript code to run when the dependencies are ready, and the prompt is only run if the code returns true.

```yaml
prompts:
  - $pipeline:
      - prompt: Write a haiku about {{topic}}.
        outputAs: haiku
      - deps: ['haiku'] # By depending on the variable `haiku` and outputing a variable `haiku`, we create a loop
        if: | # It's necessary to have an if-statement that breaks us out of the loop
          function execute(vars) {
            return vars.$history.length < 10; // Exit after 10 prompts
          }
        prompt: Here is a haiku about {{topic}}, make it better:\n{{haiku}}
        outputAs: haiku
```

### Tests

Format:

```typescript
interface Config {
  tests: Array<TestCase>[];
  defaultTest?: Partial<TestCase>;
  // ...
}
interface TestCase {
  description?: string;
  vars?: Record<string, unknown>;
  assert?: Assertion[];
  only?: boolean;
}
interface Assertion {
  type: string;
  description?: string;
  vars?: Record<string, unknown>;
  id?: string;
}
```

`tests` is an array of tests. A test is an object describing the test. Vars will be substituted into the prompt. If no tests are provided, a default test will be added to test the prompt + provider combinations.

A variable may reference another file. See **Splitting configuration across multiple files** for more details. The following example sends the image and "What is this?" to the provider:

```yaml
prompts:
  - '{{image}} What is this?'
  # Will be sent as {image: ...}, {text: " What is this?"}
  # Note the whitespace

tests:
  - vars:
      image: file:///puppy.png
```

You may also limit which tests will be run by marking some as `only: true`. If any tests are marked this way, only the marked tests will be run.

### Assertions

A test may include a list of assertions to check whether the output meets certain criteria. Evals supports the following:

- [x] javascript (optionally **row-level**) -- run Javascript code on output, see below. Vars: `{ code: string; row?: boolean }`
- [x] equals -- compare against a string, optionally ignoring case. Vars: `{ value: string, ignoreCase?: boolean, trim?: boolean }`
- [x] contains -- check if the output contains a string, optionally ignoring case. Vars: `{ needle: string, ignoreCase?: boolean }`
- [x] regex -- test against a regex pattern, with optional flags (e.g. "i" for case-insensitive, see [docs](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions#advanced_searching_with_flags)). Vars: `{ pattern: string, flags?: string }`
- [ ] is-json
- [ ] cost
- [ ] latency
- [x] llm-rubric -- ask an LLM to validate the output. Provider defaults to `gemini-2.5-pro`. If you override `prompt`, it should be a template containing both `{{#each output}}{{this}}{{/each}}` and `{{rubric}}`. Vars: `{ rubric: string; prompt?: string; provider?: string}`. Note that output is an array to support cases like DALL-E.
- [x] select-best (**row-level**) -- ask an LLM to pick the best output. Only one will pass! Vars: `{ criteria: string, prompt?: string, provider: Provider }`
- [x] consistency (**row-level**) -- ask an LLM to evaluate all of the outputs and decide if they all pass or not. Vars: `{ criteria: string, prompt?: string, provider: Provider }`

Any assertion vars that are strings will be treated as Handlebars templates, and the test case's vars will be populated. (Note: this does not apply to `javascript` assertions, which receive the test case's vars directly.)

This makes it easy to define assertions inside defaultTest, using variables to tweak the assertion for each test case.

```yaml
# ...
defaultTest:
  assert:
    - type: contains
      vars:
        needle: '{{translation}}'
      ignoreCase: true
    - type: llm-rubric
      vars:
        rubric: Is a poem
tests:
  - vars:
      language: Spanish
    translation: hola
```

#### Assertion IDs

You can give an assertion an `id` to track its pass/fail rate across all tests. This is useful for tracking the success rate of a particular assertion across different prompts and providers.

```yaml
tests:
  - assert:
      - type: contains
        id: has-washington
        vars:
          needle: washington
```

#### Javascript Assertions

For `javascript` assertions, your code must provide a function with this signature:

_Note: row-level assertions are also supported, see further down_

```typescript
execute(output: string | ArrayOutput, context: Context): MaybePromise<AssertionResult>

type ArrayOutput = Array<string | { file: File; uri: string }>; // Used for DALL-E
type Context = {
  vars: Record<string, unknown>; // Test case vars
  provider: { id: string | null; labeled?: Record<string, { id: string }> }; // Provider
  // Labeled providers are only used for pipeline prompts
  prompt: Prompt; // Prompt
};
```

Typescript is also supported, and will be compiled to Javascript. Your `execute` function must return whether the assertion passed, along with optional additional information.

Note: with DALL-E, `output` will be an array of `[{file: File, uri: string}, string|undefined]` containing the image and the (optional) revised prompt.

```typescript
interface AssertionResult {
  pass: boolean;
  message?: string;
  visuals?: (string | Blob)[];
  outputs?: Record<string, number | boolean>;
}
```

For example:

```js
function execute(output, context) {
  return { pass: output.length > 100; }
}
```

The code is run inside a sandboxed iframe with `<script type="module">`. It is only instantiated once for the entire run, so avoid side effects or global state. You can reference other files in your directory and import libraries from a CDN, but npm packages are not supported. Errors running the code will be shown in the UI.

For a row-level Javascript assertion, return a function with this signature:

```typescript
execute(outputs: TestOutput[], context: Context): MaybePromise<AssertionResult[]>

interface TestOutput {
  rawPrompt: unknown;

  // Success
  rawOutput?: unknown;
  output?: string | (string|FileReference)[];
  latencyMillis?: number;
  tokenUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    costDollars?: number;
  };
  history?: (TestOutput & {id: string})[]; // For pipelines

  // Error
  error?: string;
}
```

#### Visuals

Visuals are shown in the test cell after the output, allowing you to interpret the results in some way. They may be a string or an image (PNG/JPEG) as a Blob.

#### Outputs

You can use the `outputs` property in your JavaScript assertions to track additional data points.

```javascript
function execute(output, context) {
  const wordCount = output.split(/\s+/).length; // Count words in the output

  return {
    pass: true, // Assuming the test passes
    outputs: {
      wordCount: wordCount, // Store the word count
      hasKeywords: output.includes('AI') && output.includes('machine learning'), // Check for keywords
    },
  };
}
```

The UI will display the following:

- **Numbers:** The average value of all outputs with the same key.
- **Booleans:** The percentage of outputs with the same key that are `true`.

### Options

```typescript
interface Config {
  // ...
  options?: {
    maxConcurrency?: number;
  };
}
```

Set global options for the configuration:

- `maxConcurrency` -- set the maximum number of tests that can execute in parallel. Defaults to `Infinity`. (Note: each Provider may have its own concurrency limit, e.g. browsers only allow 6 connections in parallel).

## Run Format

When you run tests, the results will be saved in a `runs/` folder within your selected folder.
You don't need to know the format if you are just viewing it through the tool. But if you do want
to process it for some reason, see below.

The run tables offer features such as:

- Showing test variables (ordered by their presence in the tests)
- Toggling whether variable values for each test are displayed (remembered across sessions)
- Resizing columns
- Toggling the variables between the full result (default), just the pass/fail indicator, a max-height view that you can scroll.
- Copying variables
- Viewing the full prompt and output

```typescript
interface Run {
  version: 1;
  id: string;
  timestamp: number;
  description?: string;
  envs: {
    provider: Provider;
    prompt: Prompt;
  }[];
  tests: TestCase[];
  results: TestResult[][]; // tests x envs
}
interface TestResult {
  rawPrompt: unknown;
  pass: boolean;
  assertionResults: AssertionResult[];

  // On success
  rawOutput?: unknown;
  output?: string;
  latencyMillis?: number;
  tokenUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    costDollars?: number;
  };

  // On error
  error?: string;
}
interface AssertionResult {
  id?: string;
  pass: boolean;
  message?: string;
  visuals?: string[];
  outputs?: Record<string, number | boolean>;
}
```

## Other Features

### Cache

In Settings, you can enable the cache. When enabled, provider responses are cached to reduce latency and cost when re-running the same prompt.

### User Interface

- The Configuration tab lets you write a configuration in the browser, which will be saved in-memory. You can save it to disk at any point.
- When you run tests, it will check if your configuration has changed on disk and prompt you to use the updated one if so.
- If you run tests and they are taking a while, feel free to navigate elsewhere -- a notification will be shown when your tests are complete.
- Click the pencil icon to save notes for a results cell.
- You can quickly navigate the results table using the keyboard. Click a cell to begin, then use arrow keys to navigate. Tap "n" to edit the notes for your current cell.

### Splitting configuration across multiple files

You can split your configuration across multiple files. You reference another file either with an absolute path from the root project folder (e.g. `file:///path/from/folder/file.yaml`), or via a relative path from the current file (e.g. `file://./path/from/folder/file.yaml`).

Any portion of the configuration can be replaced with a reference to a `.yaml` or `.json` file.

```yaml
providers:
  - file:///providers/gemini-pro-jsonmode.yaml
```

Any string in the configuration can be replaced with a reference to a `.txt` or `.js` file.

```yaml
prompts:
  - file://./prompts/poem.txt
```

Any array in the configuration can be replaced with a glob, or include a glob which will be flattened into the array.

```yaml
# Glob will be expanded into an array
prompts: file:///prompts/*.txt

# Glob element in an array will be flattened
tests:
  - file:///tests/**/*.yaml
  - description: foo
    vars:
      request: Who was the first US president?
```

### Generators

Generators can help you quickly create tests (or any other configuration) from whatever data you already have. They allow you to use code to create any portion of the configuration file. You can optionally pass them arguments.

```yaml
providers:
  =gen: function(...args) {return args.map(a => `openai:${a}`);}
  args:
    - 4o
    - 4o-mini

# Transforms into...
providers:
  - openai:4o
  - openai:4o-mini
```

Similar to `javascript` assertions, generators expose an `execute(...args)` function that will be called with whatever args you provide. They can return primitive values, arrays, and objects; Blobs and `file:///` paths will be treated as files. The value is inserted into the tree or array. If a generator inside an array returns an array, the returned value will be spliced into its parent. You can even merge a returned object with its parent object by using the `...` key.

```yaml
# Tests will be merged
tests:
  - file:///test1.yaml
  - =gen: file:///make-more-tests.ts

providers:
  - gemini:gemini-2.5-pro
    config:
      generationConfig:
        temperature: 0.1
        '...':
```

The built-in `=gen-tests` generator lets you create tests from a CSV file. The columns in the file will be treated as `vars` for the test, with the header rows as the variable names. An optional `__description` column will be used as the description.

```yaml
tests:
  =gen-tests: file:///foo.csv
```

### Multiple configurations

You can create multiple configuration files within your folder (including in subdirectories) by naming them `*.evals.yaml`. A dropdown in the header bar lets you switch between them. Runs will be saved in a corresponding folder, for example runs for `basic.evals.yaml` will be saved to `runs/basic/<ID>.json`.

For legacy reasons, `config.yaml` is also supported.

### Development

For testing, there is an `echo:` provider (suffix is ignored). It will output an array of any strings/blobs it is given.

There is also a `reverser:` provider (suffix is ignored). It will concatenate any text messages with newlines and output the reversed value.
