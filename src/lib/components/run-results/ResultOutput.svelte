<script lang="ts">
  import { FileReference } from '$lib/storage/FileReference';
  import { isImageFile } from '$lib/utils/media';

  export let output: (string | FileReference)[] = [];
</script>

{#each output as output}
  {#if typeof output === 'string'}
    {output}
  {:else if output instanceof FileReference && isImageFile(output)}
    <img
      src={URL.createObjectURL(output.file)}
      alt={output.file.name}
      class="max-h-[512px] w-full max-w-[512px]"
    />
  {:else}
    {output.uri}
  {/if}
{/each}
