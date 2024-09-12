<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';
	import Textarea from '$lib/components/ui/textarea/textarea.svelte';
	import {
		loadStateFromStorage,
		saveInMemoryConfigToFileSystem,
		setInMemoryConfig,
		setStorage
	} from '$lib/state/actions';
	import { configStore, storageStore } from '$lib/state/stores';
	import { FileSystemEvalsStorage } from '$lib/storage/FileSystemEvalsStorage';
	import { InMemoryStorage } from '$lib/storage/InMemoryStorage';
	import { WebFileSystemStorage } from '$lib/storage/WebFileSystemStorage';
	import dedent from 'dedent';
	import { onMount } from 'svelte';

	async function reload() {
		await loadStateFromStorage();
	}

	function handleTabKey(event: KeyboardEvent) {
		if (event.key === 'Tab') {
			event.preventDefault();
			const target = event.target as HTMLTextAreaElement;
			const start = target.selectionStart;
			const end = target.selectionEnd;

			target.value = target.value.substring(0, start) + '  ' + target.value.substring(end);
			target.selectionStart = target.selectionEnd = start + 2;
		}
	}

	let config = '';

	onMount(async () => {
		if (
			$storageStore instanceof FileSystemEvalsStorage &&
			$storageStore.fs instanceof InMemoryStorage
		) {
			const file = await $storageStore.fs.loadFile('file:///config.yaml');
			config = await file.text();
		}
	});

	async function handleSaveToInMemoryStorage() {
		setInMemoryConfig(config);
	}

	function handleUseSample() {
		config = SAMPLE_CONFIG;
		handleSaveToInMemoryStorage();
	}

	function handleSwitchToInMemoryStorage() {
		config = '';
		setStorage(null);
	}

	const SAMPLE_CONFIG = dedent`
		providers:
		  - gemini:gemini-1.5-pro-latest

		prompts:
		  - "write a couplet about {{topic}}"
		  - "write a haiku about {{topic}}"

		tests:
		  - vars:
		      topic: George Washington
	`;
</script>

<article class="prose">
	{#if $storageStore !== null && $storageStore instanceof FileSystemEvalsStorage && $storageStore.fs instanceof WebFileSystemStorage}
		<p>This page shows your current configuraton. Editing is not yet supported.</p>
		<Button on:click={reload}>Reload</Button>
		<Button variant="secondary" on:click={handleSwitchToInMemoryStorage}>Write a config</Button>

		<pre>{JSON.stringify($configStore, null, 2)}</pre>
	{:else}
		<p>To view your configuration, choose a folder or create a config below.</p>
		<Textarea
			bind:value={config}
			rows={10}
			class="font-mono"
			style="tab-size: 2;"
			on:keydown={handleTabKey}
			on:input={handleSaveToInMemoryStorage}
		></Textarea>
		<Button on:click={handleUseSample}>Use sample config</Button>
	{/if}
</article>
