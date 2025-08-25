<script lang="ts">
  import { FileReference } from '$lib/storage/FileReference';
  import { isImageFile, isAudioFile } from '$lib/utils/media';
  import type { ProviderOutputPart } from '$lib/types';

  export let output: ProviderOutputPart[] = [];
</script>

{#each output as output}
  {#if typeof output === 'string'}
    {output}
  {:else if output instanceof FileReference && isImageFile(output)}
    <img src={URL.createObjectURL(output.file)} alt={output.file.name} class="max-h-[512px]" />
  {:else if output instanceof FileReference && isAudioFile(output)}
    <audio controls src={URL.createObjectURL(output.file)}>
      Your browser does not support the audio element.
    </audio>
  {:else if output instanceof FileReference}
    {output.uri}
  {:else if 'type' in output && output.type === 'meta'}
    <div class="mb-2 whitespace-pre-wrap rounded-lg bg-gray-100 p-2">
      {output.message.trim()}
    </div>
  {/if}
{/each}
