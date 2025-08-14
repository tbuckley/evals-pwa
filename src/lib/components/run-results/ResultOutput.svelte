<script lang="ts">
  import { FileReference } from '$lib/storage/FileReference';
  import { isImageFile, isAudioFile } from '$lib/utils/media';

  export let output: (string | FileReference)[] = [];
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
  {:else}
    {output.uri}
  {/if}
{/each}
