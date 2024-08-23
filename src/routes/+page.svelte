<script lang="ts">
	import Combobox from '$lib/components/Combobox.svelte';
	import RunResultsTable from '$lib/components/run-results/run-results-table.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { chooseFolder, runTests } from '$lib/state/actions';
	import { runTitleListStore, selectedRunStore, selectedRunTitle } from '$lib/state/derived';
	import { configStore, selectedRunIdStore } from '$lib/state/stores';
</script>

<article class="prose">
	{#if $configStore === null}
		<h1>Welcome to Evals!</h1>
		<p>
			You can evaluate popular LLM models using your own prompts and test cases, all from within
			your browser. Apart from requests directly to the LLM providers (like OpenAI or Google), no
			data ever leaves your device. Your configuration is stored on your file system, and API keys
			are saved to your browser's local storage.
		</p>
		<h2>Getting started</h2>
		<p>
			To get started, <a href="##" on:click|preventDefault={chooseFolder}>choose a folder</a>
			containing a <code>config.yaml</code> file that looks like this:
		</p>
		<pre>
# An optional short description to help identify outputs
description: My first eval

# One or more prompts you are testing
prompts:
	- Respond like a pirate to this request: {'{{request}}'}}
	- Respond with a haiku to this request: {'{{request}}'}}

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
</pre>
		<p>
			For more details, check out the <a href="/documentation">documentation</a>.
		</p>
	{:else}
		<Button on:click={runTests}>Run tests</Button>
	{/if}
</article>

{#if $selectedRunStore !== null}
	<div>
		<Combobox
			items={$runTitleListStore.map((run) => ({
				value: run.id,
				label: run.title
			}))}
			value={$selectedRunIdStore || ''}
			on:select={(e) => selectedRunIdStore.set(e.detail)}
		></Combobox>
		<h2 class="mb-4 mt-8 text-xl font-bold">
			{$selectedRunTitle}
		</h2>

		<!-- Use a keyed block so we don't try to reuse a table that was created with a different layout -->
		{#key $selectedRunStore.id}
			<RunResultsTable run={$selectedRunStore} />
		{/key}
	</div>
{/if}
