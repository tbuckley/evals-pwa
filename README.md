# evals-pwa

A [Promptfoo](https://www.promptfoo.dev/docs/intro)-inspired evaluation framework for AI prompts as a static PWA. There is no cloud backend, so all your data stays on your device (except for any prompts, which run directly against the Gemini/etc backends). It's free (ignoring your costs to run prompts), private, and requires no installation.

Try it out at [evals-pwa.pages.dev](https://evals-pwa.pages.dev/), hosted on Cloudflare Pages.

## Usage

See `src/routes/documentation/+page.md`

## Building

This project uses:

- Svelte+SvelteKit as a framework
- shadcn-svelte for UI components
- Tailwind for styling
- zod for validation
- mdsvex for markdown rendering
