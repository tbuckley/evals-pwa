<script lang="ts">
  import { FileReference } from '$lib/storage/FileReference';
  import type { Readable } from 'svelte/store';
  import Button from '../ui/button/button.svelte';
  import Copy from 'lucide-svelte/icons/copy';
  import { isImageFile } from '$lib/utils/media';

  export let value: unknown;
  export let height: Readable<'minimal' | 'collapsed' | 'expanded'>;

  async function copy() {
    if (typeof value === 'string') {
      await navigator.clipboard.writeText(value);
    }
  }
</script>

<div
  class="relative overflow-hidden"
  class:whitespace-nowrap={$height === 'minimal'}
  class:whitespace-pre-wrap={$height !== 'minimal'}
  class:max-w-lg={$height === 'minimal'}
  class:truncate={$height === 'minimal'}
  class:max-h-48={$height === 'collapsed'}
  class:overflow-y-auto={$height === 'collapsed'}
>
  {#if typeof value === 'string'}
    <Button on:click={copy} variant="ghost" size="icon" class="float-right text-gray-500">
      <Copy class="h-5 w-5"></Copy>
    </Button>
    {value}
  {:else if typeof value === 'object' && value !== null}
    {#if value instanceof FileReference}
      {#if isImageFile(value)}
        <img
          src={URL.createObjectURL(value.file)}
          alt={value.file.name}
          class="max-h-[200px] max-w-[200px]"
        />
      {:else}
        {value.uri}
      {/if}
    {:else}
      {JSON.stringify(value, null, 2)}
    {/if}
  {:else if !value}
    <span class="italic">-N/A-</span>
  {:else}
    {value}
  {/if}
</div>
