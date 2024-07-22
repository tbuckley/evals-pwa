<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';
	import { loadStateFromStorage } from '$lib/state/actions';
	import { configStore } from '$lib/state/stores';

	async function reload() {
		await loadStateFromStorage();
	}
</script>

<article class="prose">
	{#if $configStore !== null}
		<p>This page shows your current configuraton. Editing is not yet supported.</p>
		<Button on:click={reload}>Reload</Button>

		<pre>{JSON.stringify($configStore, null, 2)}</pre>
	{:else}
		<p>To view your configuration, first select a project.</p>{/if}
</article>
