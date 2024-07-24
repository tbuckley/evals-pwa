<script lang="ts">
	import Button from './ui/button/button.svelte';
	import { storageStore } from '$lib/state/stores';
	import { chooseFolder, loadStateFromStorage } from '$lib/state/actions';

	import Folder from 'lucide-svelte/icons/folder';
	import RefreshCcw from 'lucide-svelte/icons/refresh-ccw';
</script>

{#if $storageStore === null}
	<Button class="gap-2" variant="ghost" on:click={chooseFolder}>
		<Folder class="h-4 w-4"></Folder>
		Choose a folder
	</Button>
{:else}
	<Button class="gap-2" variant="secondary" on:click={chooseFolder}>
		<Folder class="h-4 w-4"></Folder>
		{$storageStore.getName()}
	</Button>
	<Button on:click={loadStateFromStorage} variant="secondary" size="icon" class="rounded-full">
		<RefreshCcw class="h-4 w-4"></RefreshCcw>
	</Button>
{/if}
