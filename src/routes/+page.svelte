<script lang="ts">
	import Combobox from '$lib/components/Combobox.svelte';
	import RunResultsTable from '$lib/components/run-results/run-results-table.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { chooseFolder, runTests } from '$lib/state/actions';
	import { runListStore, selectedRunStore } from '$lib/state/derived';
	import { configStore, selectedRunIdStore } from '$lib/state/stores';

	const dateFormatter = new Intl.DateTimeFormat('en-US', {
		dateStyle: 'medium',
		timeStyle: 'short'
	});
</script>

<article class="prose">
	{#if $configStore === null}
		<p>
			Welcome to Evals PWA! Your can evaluate popular LLM models using your own prompts and test
			cases, all from within your browser. Apart from requests directly to the LLM providers (like
			OpenAI or Google), no data is sent to every server. Your configuration is stored on your file
			system, and API keys are saved to your browser's local storage.
		</p>
		<a href="##" on:click|preventDefault={chooseFolder}>Choose a folder</a> to get started
	{:else}
		<Button on:click={runTests}>Run tests</Button>
	{/if}
</article>

{#if $selectedRunStore !== null}
	<div>
		<Combobox
			items={$runListStore.map((run) => ({
				value: run.id,
				label: dateFormatter.format(new Date(run.timestamp))
			}))}
			value={$selectedRunIdStore || ''}
			on:select={(e) => selectedRunIdStore.set(e.detail)}
		></Combobox>
		<h2 class="mb-4 mt-8 text-xl font-bold">
			{dateFormatter.format(new Date($selectedRunStore.timestamp))}
		</h2>

		<!-- Use a keyed block so we don't try to reuse a table that was created with a different layout -->
		{#key $selectedRunStore.id}
			<RunResultsTable run={$selectedRunStore} />
		{/key}
	</div>
{/if}
