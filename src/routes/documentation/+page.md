# Documentation

A [Promptfoo](https://www.promptfoo.dev/docs/intro)-inspired evaluation framework for AI prompts. There is no cloud backend, so all your data stays on your device -- prompts run directly against the Gemini/etc backends. It's free (ignoring LLM costs), private, and requires no installation.

## Table of Contents

## Getting Started

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
  - gemini:gemini-1.5-pro-latest
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
type Provider = string | { id: string; prompts?: Prompt[] };
```

Currently supported model providers:

- [x] Gemini -- prefix with `gemini:`, e.g. `gemini:gemini-1.5-pro-latest`. Requires `GEMINI_API_KEY` in your environment.
- [x] OpenAI -- prefix with `openai:`, e.g. `openai:gpt-4o`. Requires `OPENAI_API_KEY` in your environment.
- [x] [Chrome](https://goo.gle/chrome-ai-dev-preview) -- use `chrome:ai`.
- [x] Ollama -- prefix with `ollama:`, e.g. `ollama:gemma-2:2b`. Requires `OLLAMA_ENDPOINT` (e.g. `http://localhost:11434`) in your environment, or the `apiBaseUrl` config option.
- [x] [WebLLM](https://github.com/mlc-ai/web-llm) -- prefix with `web-llm:`, e.g. `web-llm:gemma-2-2b-it-q4f32_1-MLC`. See [here](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts#L309) for a list of supported model IDs. Requires [WebGPU](https://caniuse.com/webgpu).
- [x] Anthropic -- prefix with `anthropic:`, e.g. `anthropic:claude-3-5-sonnet-latest`. Requires `ANTHROPIC_API_KEY` in your environment.
- [x] DALL-E -- prefix with `dalle:`, e.g. `dalle:dall-e-3`. Requires `OPENAI_API_KEY` in your environment. Output is an array containing an image. View a result's details to see the revised prompt DALL-E creates.

#### Provider Config

When providers are defined in the expanded form, additional configuration options can be specified:

```yaml
providers:
  - id: ollama:llama3:8b
    config:
      apiBaseUrl: http://localhost:11434
      response_format: { type: 'json_object' }
  - id: gemini:gemini-1.5-flash-latest
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

**OpenAI Config**

- `apiBaseUrl` -- the base for the API endpoint, default: `https://api.openai.com`
- `...` -- additional properties to include in the API request, see <https://platform.openai.com/docs/api-reference/chat/completions>

**Ollama Config**

Equivalent to OpenAI Config.

### Prompts

Format:

```typescript
type Prompt = string;
interface Config {
  prompts: Prompt[];
  // ...
}
```

`prompts` is an array of prompts. Prompts use [Handlebars](https://handlebarsjs.com/) format (unlike Promptfoo's nunjucks). Test case variables are all considered "safe" strings and will not be escaped.

A prompt variable may also be substituted with a file, depending on what the provider supports. For example, Gemini models supports PDF and various image, video, and audio formats.

To include system instructions or simulate a conversation, you can specify roles. Note that the prompt is still just a string, but it contains valid yaml; this approach supports iterating over a set of messages if desired.

```yaml
prompts:
  - |-
    - system: You are {{persona}} named {{name}}.
    - user: What is your name?
    - assistant: I am {{name}}.
    - user: Where do you live?
```

Multi-role prompts are currently only supported for Gemini, OpenAI, and Anthropic models.

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
  asserts?: Assertion[];
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

- [x] javascript -- run Javascript code on output, see below. Vars: `{ code: string }`
- [x] equals -- compare against a string, optionally ignoring case. Vars: `{ value: string, ignoreCase?: boolean, trim?: boolean }`
- [x] contains -- check if the output contains a string, optionally ignoring case. Vars: `{ needle: string, ignoreCase?: boolean }`
- [x] regex -- test against a regex pattern, with optional flags (e.g. "i" for case-insensitive, see [docs](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions#advanced_searching_with_flags)). Vars: `{ pattern: string, flags?: string }`
- [ ] is-json
- [ ] cost
- [ ] latency
- [x] llm-rubric -- ask an LLM to validate the output. Provider defaults to `gemini-1.5-pro-latest`. If you override `prompt`, it should be a template containing both `{{#each output}}{{this}}{{/each}}` and `{{rubric}}`. Vars: `{ rubric: string; prompt?: string; provider?: string}`. Note that output is an array to support cases like DALL-E.

Any assertion vars that are strings will be treated as Handlebars templates, and the test case's vars will be populated. (Note: this does not apply to `javascript` assertions, which receive the test case's vars directly.)

This makes it easy to define assertions inside defaultTest, using variables to tweak the assertion for each test case.

```yaml
# ...
defaultTest:
  asserts:
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
  - asserts:
      - type: contains
        id: has-washington
        vars:
          needle: washington
```

#### Javascript Assertions

For `javascript` assertions, your code must provide a function `execute(output: string, context: { vars: Record<string, unknown> }): MaybePromise<AssertionResult>`. Typescript is also supported, and will be compiled to Javascript. Your `execute` function must return whether the assertion passed, along with optional additional information.

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

### User Interface

- The Configuration tab lets you write a configuration in the browser, which will be saved in-memory. You can save it to disk at any point.
- When you run tests, it will check if your configuration has changed on disk and prompt you to use the updated one if so.
- If you run tests and they are taking a while, feel free to navigate elsewhere -- a notification will be shown when your tests are complete.

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
  =gen: function(...args) {return args.map(a => `gemini:${a}`);}
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
  - gemini:gemini-1.5-pro-latest
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

For testing, there is a `reverser:` provider (suffix is ignored). It will concatenate any text messages with newlines and output the reversed value.
