# evals-pwa

A [Promptfoo](https://www.promptfoo.dev/docs/intro)-inspired evaluation framework for AI prompts as a static PWA. There is no cloud backend, so all your data stays on your device (except for any prompts, which run directly against the Gemini/etc backends). It's free (ignoring your costs to run prompts), private, and requires no installation.

Try it out at [evals-pwa.pages.dev](https://evals-pwa.pages.dev/), hosted on Cloudflare Pages.

## Getting Started

Create a folder containing a `config.yaml` file (see [YAML spec](https://yaml.org/)). It is mostly following the Promptfoo format, with some minor differences. _TODO: document the differences_

Once you select it, you will then be prompted (ha) to add API keys (or other required env variables) before continuing. These will be saved in your browser's local storage across sessions. You can edit them from the settings icon in the top-right.

If you run tests and they are taking a while, feel free to navigate elsewhere -- a notification will be shown when your tests are complete.

```yaml
description: A description

providers:
  - gemini:gemini-1.5-pro-latest
  - gemini:gemini-1.5-flash-latest

prompts:
  - Speak like a pirate. {{request}}
  - Only respond with a haiku. {{request}}

tests:
  - description: foo
    vars:
      request: Who was the first US president?
    assert:
      - type: icontains
        vars:
          needle: washington
```

### Providers

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
- [ ] Anthropic

For testing, there is also a `reverser:` provider (suffix is ignored). It will concatenate any text messages with newlines and output the reversed value.

### Prompts

Format:

```typescript
type Prompt = string;
interface Config {
	prompts: Prompt[];
	// ...
}
```

Unlike Promptfoo, these use [Handlebars](https://handlebarsjs.com/) format instead. Test case variables are considered "safe" strings and will not be escaped.

If the format matches the following, the request will combine the text and images in the order given. Otherwise it will be a string.

```json
[{ "text": "A text prompt here" }, { "image": "file:///path/to/image.png" }]
```

### Tests

Format:

```typescript
interface Config {
	tests: TestCase[];
	defaultTest?: Partial<TestCase>;
	// ...
}
interface TestCase {
	description?: string;
	vars?: Record<string, string>;
	asserts?: Assertion[];
}
interface Assertion {
	type: string;
	description?: string;
	vars?: Record<string, unknown>;
}
```

Supported assertion types:

- [x] javascript -- run javascript code on output, see below. Vars: `{ code: string }`
- [ ] equals
- [ ] contains
- [x] icontains -- case insensitive contains. Vars: `{ needle: string }`
- [x] regex -- test against a regex pattern, with optional flags (e.g. "i" for case-insensitive, see [docs](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions#advanced_searching_with_flags)). Vars: `{ pattern: string, flags?: string }`
- [ ] is-json
- [ ] cost
- [ ] latency

Any assertion vars that are strings will be treated as Handlebars templates, and the test case's vars will be populated.
This makes it easy to define assertions inside defaultTest, using variables to tweak the assertion for each test case.

```yaml
# ...
defaultTest:
  asserts:
	- type: icontains
	  vars:
	    needle: "{{translation}}"
tests:
  - vars:
      language: Spanish
	  translation: hola
```

### Javascript Assertions

For `javascript` assertions, your code must provide a function `execute(output: string): Promise<AssertionResult>`.

```typescript
interface AssertionResult {
	pass: boolean;
	message?: string;
}
```

For example:

```js
function execute(output) {
	return { pass: output.length > 100; }
}
```

The code is run inside a sandboxed iframe with `<script type="module">`. You can import libraries from a CDN, but you cannot reference other files in your directory.

Note: Currently, every javascript assertion will be instantiated once per test case using it. In future we plan to only instantiate each unique script a single time and reuse it across test cases. Please avoid creating any global state that would affect following test cases.

### Runs

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
	pass: boolean;
	message?: string;
}
```

## Building

This project uses:

- Svelte+SvelteKit as a framework
- shadcn-svelte for UI components
- Tailwind for styling
- zod for validation
