<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';
	import Textarea from '$lib/components/ui/textarea/textarea.svelte';
	import { loadStateFromStorage } from '$lib/state/actions';
	import { envStore } from '$lib/state/env';
	import { promptStore, storageStore, testStore } from '$lib/state/stores';
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

	function runTests() {
		alert('Not implemented');
	}
	async function reload() {
		await loadStateFromStorage();
	}
</script>

<article class="prose">
	<h1>Welcome to Evals PWA</h1>

	<h2>Environment</h2>
	<Textarea bind:value={$envStore}></Textarea>

	<Button on:click={chooseFolder}>Choose folder</Button>
	{#if $storageStore !== null}
		<Button on:click={runTests}>Run tests</Button>
		<Button on:click={reload}>Reload</Button>

		<h2>Prompts</h2>
		<ul>
			{#each $promptStore as prompt}
				<li>{prompt.description ?? prompt.id}</li>
			{:else}
				<li>No prompts found</li>
			{/each}
		</ul>

		<h2>Test Cases</h2>
		<ul>
			{#each $testStore as test}
				<li>{test.description ?? test.id}</li>
			{:else}
				<li>No test cases found</li>
			{/each}
		</ul>
	{/if}
</article>
