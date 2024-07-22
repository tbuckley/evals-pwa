<script lang="ts">
	import RunResultsTable from '$lib/components/run-results/run-results-table.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { loadStateFromStorage, runTests } from '$lib/state/actions';
	import { configStore, runStore, storageStore } from '$lib/state/stores';
	import { FileSystemStorage } from '$lib/storage/fileSystemStorage';

	async function chooseFolder() {
		let dir: FileSystemDirectoryHandle;
		try {
			dir = await window.showDirectoryPicker({
				mode: 'readwrite',
				id: 'evals-pwa', // Remember the last used location
				startIn: 'documents' // Default to the documents folder
			});
		} catch (err) {
			console.error(err);
			return;
		}

		const storage = new FileSystemStorage(dir);
		storageStore.set(storage);
		await loadStateFromStorage();
	}

	async function reload() {
		await loadStateFromStorage();
	}

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
		<Button on:click={chooseFolder}>Choose a folder</Button> to get started
	{:else}
		<Button on:click={chooseFolder}>Change folder</Button>
		<Button on:click={runTests}>Run tests</Button>
	{/if}
</article>

<div>
	{#each $runStore as run}
		<h2 class="mb-4 mt-8 text-xl font-bold">{dateFormatter.format(new Date(run.timestamp))}</h2>
		<RunResultsTable {run} />
	{/each}
</div>
