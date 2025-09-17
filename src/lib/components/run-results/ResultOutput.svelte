<script lang="ts">
  import { FileReference } from '$lib/storage/FileReference';
  import { isImageFile, isAudioFile } from '$lib/utils/media';
  import type { ProviderOutputPart } from '$lib/types';
  import { BrainIcon, CircleEllipsisIcon, CodeIcon, SearchIcon } from 'lucide-svelte';
  import { showMetadataStore } from '$lib/state/settings';

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
  {:else if 'type' in output && output.type === 'meta' && $showMetadataStore}
    <div class="mb-2 whitespace-normal rounded-lg bg-gray-200 p-2">
      <div class="flex items-center gap-2">
        {#if output.icon === 'thinking'}
          <BrainIcon class="size-4" />
        {:else if output.icon === 'search'}
          <SearchIcon class="size-4" />
        {:else if output.icon === 'code'}
          <CodeIcon class="size-4" />
        {:else}
          <CircleEllipsisIcon class="size-4" />
        {/if}
        <div class="font-bold">{output.title}</div>
      </div>
      <div class="whitespace-pre-wrap">{output.message.trim()}</div>
    </div>
  {:else if 'type' in output && output.type === 'function-call' && $showMetadataStore}
    <div class="mb-2 whitespace-normal rounded-lg bg-gray-200 p-2">
      <div class="flex items-center gap-2">
        <CodeIcon class="size-4" />
        <div class="font-bold">Function Call</div>
      </div>
      <div>{output.name}</div>
      <div class="whitespace-pre-wrap">{JSON.stringify(output.args, null, 2)}</div>
    </div>
  {:else if 'type' in output && output.type === 'function-response' && $showMetadataStore}
    <div class="mb-2 whitespace-normal rounded-lg bg-gray-200 p-2">
      <div class="flex items-center gap-2">
        <CodeIcon class="size-4" />
        <div class="font-bold">Function Response</div>
      </div>
      <div>{output.call}</div>
      <div class="whitespace-pre-wrap">{JSON.stringify(output.response, null, 2)}</div>
    </div>
  {/if}
{/each}
