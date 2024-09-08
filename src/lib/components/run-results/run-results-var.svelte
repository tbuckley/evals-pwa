<script lang="ts">
	import { FileReference } from '$lib/storage/FileReference';

	export let value: any;

	function isImageFile(val: unknown): val is FileReference {
		const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
		return (
			val instanceof FileReference &&
			imageExtensions.some((ext) => val.uri.toLowerCase().endsWith(ext))
		);
	}
</script>

{#if typeof value === 'string'}
	{value}
{:else if typeof value === 'object' && value !== null}
	{#if isImageFile(value)}
		<img
			src={URL.createObjectURL(value.file)}
			alt={value.file.name}
			class="max-h-[200px] max-w-[200px]"
		/>
	{:else}
		<pre class="text-xs">{JSON.stringify(value, null, 2)}</pre>
	{/if}
{:else if !value}
	<span class="italic">-N/A-</span>
{:else}
	{value}
{/if}
