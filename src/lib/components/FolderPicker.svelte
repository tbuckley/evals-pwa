<script lang="ts">
	import Button from './ui/button/button.svelte';
	import { storageStore } from '$lib/state/stores';
	import {
		chooseFolder,
		loadStateFromStorage,
		saveInMemoryConfigToFileSystem
	} from '$lib/state/actions';

	import Folder from 'lucide-svelte/icons/folder';
	import RefreshCcw from 'lucide-svelte/icons/refresh-ccw';
	import FileWarning from 'lucide-svelte/icons/file-warning';
	import Save from 'lucide-svelte/icons/save';
	import { FileSystemEvalsStorage } from '$lib/storage/FileSystemEvalsStorage';
	import { InMemoryStorage } from '$lib/storage/InMemoryStorage';
	import { WebFileSystemStorage } from '$lib/storage/WebFileSystemStorage';
</script>

{#if $storageStore === null}
	<Button class="gap-2" variant="ghost" on:click={chooseFolder}>
		<Folder class="h-4 w-4"></Folder>
		Choose a folder
	</Button>
{:else if $storageStore instanceof FileSystemEvalsStorage && $storageStore.fs instanceof WebFileSystemStorage}
	<Button class="gap-2" variant="secondary" on:click={chooseFolder}>
		<Folder class="h-4 w-4"></Folder>
		{$storageStore.getName()}
	</Button>
	<Button on:click={loadStateFromStorage} variant="secondary" size="icon" class="rounded-full">
		<RefreshCcw class="h-4 w-4"></RefreshCcw>
	</Button>
{:else if $storageStore instanceof FileSystemEvalsStorage && $storageStore.fs instanceof InMemoryStorage}
	<Button class="gap-2" variant="destructive" on:click={() => saveInMemoryConfigToFileSystem()}>
		<Save class="h-4 w-4"></Save>
		Save config
	</Button>
{/if}
