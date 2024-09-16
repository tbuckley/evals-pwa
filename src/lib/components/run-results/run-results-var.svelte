<script lang="ts">
  import { FileReference } from '$lib/storage/FileReference';
  import Button from '../ui/button/button.svelte';
  import Copy from 'lucide-svelte/icons/copy';

  export let value: any;

  function isImageFile(val: unknown): boolean {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    return (
      val instanceof FileReference &&
      imageExtensions.some((ext) => val.uri.toLowerCase().endsWith(ext))
    );
  }

  async function copy() {
    if (typeof value === 'string') {
      navigator.clipboard.writeText(value);
    }
  }
</script>

{#if typeof value === 'string'}
  <div class="relative whitespace-pre-wrap">
    {value}
    <Button
      on:click={copy}
      variant="ghost"
      size="icon"
      class="absolute right-0 top-0 text-gray-500"
    >
      <Copy class="h-5 w-5"></Copy>
    </Button>
  </div>
{:else if typeof value === 'object' && value !== null}
  {#if value instanceof FileReference}
    {#if isImageFile(value)}
      <img
        src={URL.createObjectURL(value.file)}
        alt={value.file.name}
        class="max-h-[200px] max-w-[200px]"
      />
    {:else}
      <pre class="text-xs">{value.uri}</pre>
    {/if}
  {:else}
    <pre class="text-xs">{JSON.stringify(value, null, 2)}</pre>
  {/if}
{:else if !value}
  <span class="italic">-N/A-</span>
{:else}
  {value}
{/if}
