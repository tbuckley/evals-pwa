<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';
	import Textarea from '$lib/components/ui/textarea/textarea.svelte';
	import { loadStateFromStorage, runTests } from '$lib/state/actions';
	import { envStore } from '$lib/state/env';
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
</script>

<article class="prose">
	<h1>Welcome to Evals PWA</h1>

	<h2>Environment</h2>
	<Textarea bind:value={$envStore}></Textarea>

	<Button on:click={chooseFolder}>Choose folder</Button>
	{#if $configStore !== null}
		<Button on:click={runTests}>Run tests</Button>
		<Button on:click={reload}>Reload</Button>

		<pre>{JSON.stringify($configStore, null, 2)}</pre>
	{/if}

	{#each $runStore as run}
		<pre>{JSON.stringify(run, null, 2)}</pre>
	{/each}
</article>
