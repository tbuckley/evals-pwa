<script lang="ts">
	import Input from './ui/input/input.svelte';

	export let entries: [string, string][] = [];
</script>

{#each entries as [key, value], i (i)}
	<div class="mb-2 flex items-center gap-1">
		<Input type="text" value={key} readonly class="bg-gray-50 text-gray-500" tabindex={-1} />
		<Input name="env-{key.toLocaleLowerCase()}" type="text" bind:value />
	</div>
{:else}
	<div class="mb-2 text-gray-500">
		No API Keys required. Add models from providers like Gemini and OpenAI to your config file to
		begin.
	</div>
{/each}

{#if entries.length > 0}
	<div class="mb-2 text-sm text-gray-500">Keys will be saved in your browser's local storage.</div>
{/if}
