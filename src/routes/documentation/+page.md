# Documentation

A [Promptfoo](https://www.promptfoo.dev/docs/intro)-inspired evaluation framework for AI prompts as a static PWA. There is no cloud backend, so all your data stays on your device (except for any prompts, which run directly against the Gemini/etc backends). It's free (ignoring your costs to run prompts), private, and requires no installation.

## Getting Started

Create a folder containing a `evals.yaml` file (see [YAML spec](https://yaml.org/)). It is mostly following the Promptfoo format, with some minor differences. _TODO: document the differences_

Once you select it, you will then be prompted (ha) to add API keys (or other required env variables) before continuing. These will be saved in your browser's local storage across sessions. You can edit them from the settings icon in the top-right.

If you run tests and they are taking a while, feel free to navigate elsewhere -- a notification will be shown when your tests are complete. When you run tests, it will check if your configuration has changed on disk and prompt you to use the updated one if so.

```yaml
# An optional short description to help identify outputs
description: My first eval

# One or more prompts you are testing
prompts:
  - 'Respond like a pirate to this request: {{request}}'
  - 'Respond with a haiku to this request: {{request}}'

# One or more providers you want to use for running the prompts
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

## Providers

Format:

```typescript
interface Config {
  providers: Provider[];
  // ...
}
type Provider = string | { id: string; prompts?: Prompt[] };
```

Currently supported model providers:

- [x] Gemini -- prefix with `gemini:`, e.g. `gemini:gemini-1.5-pro-latest`. Requires `GEMINI_API_KEY` in your environment.
- [x] OpenAI -- prefix with `openai:`, e.g. `openai:gpt-4o`. Requires `OPENAI_API_KEY` in your environment.
- [x] [Chrome](https://goo.gle/chrome-ai-dev-preview) -- use id `chrome:ai`.
- [x] Ollama -- prefix with `ollama:`, e.g. `ollama:gemma-2:2b`. Requires `OLLAMA_ENDPOINT` (e.g. `http://localhost:11434`) in your environment, or the `apiBaseUrl` config option.
- [x] [WebLLM](https://github.com/mlc-ai/web-llm) -- prefix with `web-llm:`, e.g. `web-llm:gemma-2-2b-it-q4f32_1-MLC`. See [here](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts#L309) for a list of supported model IDs. Requires [WebGPU](https://caniuse.com/webgpu).
- [x] Anthropic -- prefix with `anthropic:`, e.g. `anthropic:claude-3-5-sonnet-20240620`. Requires `ANTHROPIC_API_KEY` in your environment.

For testing, there is also a `reverser:` provider (suffix is ignored). It will concatenate any text messages with newlines and output the reversed value.

### Provider Config

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

#### Gemini Config

Any config will be included as additional properties in the API request. See <https://ai.google.dev/api/generate-content#request-body>

#### OpenAI Config

- `apiBaseUrl` -- the base for the API endpoint, default: `https://api.openai.com`
- `...` -- additional properties to include in the API request, see <https://platform.openai.com/docs/api-reference/chat/completions>

#### Ollama Config

Equivalent to OpenAI Config.

## Prompts

Format:

```typescript
type Prompt = string;
interface Config {
  prompts: Prompt[];
  // ...
}
```

`prompts` is an array of prompts.

Unlike Promptfoo, these use [Handlebars](https://handlebarsjs.com/) format instead. Test case variables are considered "safe" strings and will not be escaped.

If a var references an image file (.png, .jpg, or .jpeg), . Note that not all providers support images.

```yaml
prompts:
  - '{{image}} What is this?'
  # Will be sent as {image: ...}, {text: " What is this?"}
  # Note the whitespace

tests:
  - vars:
      image: file:///foo.png
```

## Tests

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

Supported assertion types:

- [x] javascript -- run javascript code on output, see below. Vars: `{ code: string }`
- [x] equals -- compare against a string, optionally ignoring case. Vars: `{ value: string, ignoreCase?: boolean, trim?: boolean }`
- [x] contains -- check if the output contains a string, optionally ignoring case. Vars: `{ needle: string, ignoreCase?: boolean }`
- [x] regex -- test against a regex pattern, with optional flags (e.g. "i" for case-insensitive, see [docs](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions#advanced_searching_with_flags)). Vars: `{ pattern: string, flags?: string }`
- [ ] is-json
- [ ] cost
- [ ] latency
- [x] llm-rubric -- ask an LLM to validate the output. Provider defaults to `gemini-1.5-pro-latest`. If you override `prompt`, it should be a template containing both `{{output}}` and `{{rubric}}`. Vars: `{ rubric: string; prompt?: string; provider?: string}`

Any assertion vars that are strings will be treated as Handlebars templates, and the test case's vars will be populated. (Note: this does not apply to javascript assertions, which receive the test case's vars directly.)

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

You may also limit which tests will be run by marking some as `only: true`. If any tests are marked this way, only the marked tests will be run.

## Assertion IDs

You can give an assertion an `id` to track its pass/fail rate across all tests. This is useful for tracking the success rate of a particular assertion across different prompts and providers.

```yaml
tests:
  - asserts:
      - type: contains
        id: has-washington
        vars:
          needle: washington
```

## Javascript Assertions

For `javascript` assertions, your code must provide a function `execute(output: string, context: { vars: Record<string, unknown> }): Promise<AssertionResult>`. It returns whether the assertion passed, an optional message explaining the result, and an optional array of visuals to show in the UI. Visuals may be a string or an image (PNG/JPEG) as a Blob.

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

The code is run inside a sandboxed iframe with `<script type="module">`. You can import libraries from a CDN, but you cannot reference other files in your directory. Errors will be shown in the UI.

Note: Currently, every javascript assertion will be instantiated once per test case using it. In future we plan to only instantiate each unique script a single time and reuse it across test cases. Please avoid creating any global state that would affect following test cases.

### Outputs

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

## Runs

When you run tests, they will be saved in a `runs/` folder within your selected folder.
You don't need to know the format if you are just viewing it through the tool. But if you do want
to process it for some reason, see below.

The run tables offer features such as:

- Showing test variables (ordered by their presence in the tests)
- Toggling whether variable values for each test are displayed (remembered across sessions)
- Resizing columns

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

## Splitting across multiple files

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

## Multiple configurations

You can create multiple configuration files within your folder (including in subdirectories) by naming them `*.evals.yaml`. A dropdown in the header bar lets you switch between them. Runs will be saved in a corresponding folder, for example runs for `basic.evals.yaml` will be saved to `runs/basic/<ID>.json`.

For legacy reasons, `config.yaml` is also supported.
