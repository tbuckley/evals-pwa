# evals-pwa

A [Promptfoo](https://www.promptfoo.dev/docs/intro)-inspired evaluation framework for AI prompts as a static PWA. There is no cloud backend, so all your data stays on your device (except for any prompts, which run directly against the Gemini/etc backends). It's free (ignoring your costs to run prompts), private, and requires no installation.

Try it out at [evals-pwa.pages.dev](https://evals-pwa.pages.dev/), hosted on Cloudflare Pages.

## Getting Started

Create a folder containing a `config.yaml` file (see [YAML spec](https://yaml.org/)). It is mostly following the Promptfoo format, with some minor differences.

_TODO: document the differences_

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

- [x] Gemini -- prefix with `gemini:`
- [ ] OpenAI
- [ ] Anthropic

### Prompts

Format:

```typescript
type Prompt = string;
interface Config {
	prompts: Prompt[];
	// ...
}
```

Unlike Promptfoo, these use [Handlebars](https://handlebarsjs.com/) format instead.

If the format matches the following, the request will combine the text and images in the order given. Otherwise it will be a string.

```json
[{ "text": "A text prompt here" }, { "image": "file:///path/to/image.png" }]
```

### Tests

Format:

```typescript
interface Config {
	tests: TestCase[];
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

- [ ] javascript -- run javascript code on output
- [ ] equals
- [ ] contains
- [x] icontains -- case insensitive contains. Vars: `{ needle: string }`
- [ ] regex
- [ ] is-json
- [ ] cost
- [ ] latency

### Runs

When you run tests, they will be saved in a `runs/` folder within your selected folder.
You don't need to know the format if you are just viewing it through the tool. But if you do want
to process it for some reason, see below.

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
