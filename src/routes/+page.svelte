<script lang="ts">
	import EnvEditor from '$lib/components/env-editor.svelte';
	import RunResultsTable from '$lib/components/run-results/run-results-table.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { loadStateFromStorage, runTests } from '$lib/state/actions';
	import { envStore } from '$lib/state/env';
	import { configStore, runStore, storageStore } from '$lib/state/stores';
	import { FileSystemStorage } from '$lib/storage/fileSystemStorage';
	import SettingsIcon from 'lucide-svelte/icons/settings';
	import * as Dialog from '$lib/components/ui/dialog';
	import { invalidEnvStore, parsedEnvStore, requiredEnvStore } from '$lib/state/derived';

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

	let settingsVisible = false;
	function openSettings() {
		settingsVisible = true;
	}

	let envEditorEntries: [string, string][];
	$: {
		settingsVisible; // Reset when settings visible closes without a change
		envEditorEntries = $requiredEnvStore.map((req) => [req, $parsedEnvStore[req]]);
	}
	function saveEnv() {
		const newEnv = { ...$parsedEnvStore };
		for (const [key, value] of envEditorEntries) {
			newEnv[key] = value;
		}
		envStore.set(
			Object.entries(newEnv)
				.map(([key, value]) => `${key}=${value}`)
				.join('\n')
		);
		settingsVisible = false;
	}
</script>

<div class="mb-2 flex h-14 items-center border-b border-gray-200 px-4">
	<h1 class="text-lg font-bold">Evals PWA</h1>
	<div class="flex-1"></div>
	<Button variant="outline" on:click={openSettings}><SettingsIcon></SettingsIcon></Button>
</div>

<article class="prose m-4">
	<Button on:click={chooseFolder}>Choose a folder</Button> to get started
	{#if $configStore !== null}
		<Button on:click={runTests}>Run tests</Button>
		<Button on:click={reload}>Reload</Button>

		<pre>{JSON.stringify($configStore, null, 2)}</pre>
	{/if}
</article>

<div class="m-4">
	{#each $runStore as run}
		<h2 class="mb-4 mt-8 text-xl font-bold">{dateFormatter.format(new Date(run.timestamp))}</h2>
		<RunResultsTable {run} />
	{/each}
</div>

<Dialog.Root
	open={settingsVisible || $invalidEnvStore}
	closeOnEscape={!$invalidEnvStore}
	closeOnOutsideClick={!$invalidEnvStore}
	onOpenChange={(open) => (settingsVisible = open)}
>
	<Dialog.Content hideCloseButton={$invalidEnvStore}>
		<Dialog.Header>
			<Dialog.Title>Settings</Dialog.Title>
			<Dialog.Description>Configure your environment</Dialog.Description>
		</Dialog.Header>
		<div>
			<EnvEditor entries={envEditorEntries}></EnvEditor>
			<div class="mb-2 text-sm text-gray-500">
				Keys will be saved in your browser's local storage.
			</div>
		</div>
		<Dialog.Footer>
			<Button type="submit" on:click={saveEnv}>Save changes</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
