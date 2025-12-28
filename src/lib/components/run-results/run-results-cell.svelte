<script lang="ts">
  import type { LiveResult } from '$lib/types';
  import type { Readable } from 'svelte/store';
  import { resultDialogStore } from '$lib/state/ui';
  import Button from '../ui/button/button.svelte';
  import SquareCode from 'lucide-svelte/icons/square-code';
  import PencilIcon from 'lucide-svelte/icons/pencil';
  import Copy from 'lucide-svelte/icons/copy';
  import { FileReference } from '$lib/storage/FileReference';
  import ResultOutput from './ResultOutput.svelte';
  import * as Accordion from '../ui/accordion';
  import ResultUsage from './ResultUsage.svelte';
  import { selectedRunAnnotationStore } from '$lib/state/derived';
  import { createEventDispatcher } from 'svelte';

  export let testResult: Readable<LiveResult>;
  export let height: Readable<'minimal' | 'collapsed' | 'expanded'>;
  export let index: [number, number];

  const dispatch = createEventDispatcher();

  $: errorMessage = getErrorMessage($testResult);
  function getErrorMessage(result: LiveResult): string | null {
    if (result.error) {
      return result.error;
    }
    if (!$testResult.assertionResults) {
      return null;
    }
    const failureMessages = $testResult.assertionResults.filter((res) => !res.pass && res.message);
    return failureMessages[0]?.message ?? null;
  }

  $: annotations = $selectedRunAnnotationStore?.getCellAnnotation(index);

  function openRawPromptDialog() {
    resultDialogStore.set({
      title: `Raw Prompt`,
      result: $testResult,
    });
  }

  $: visuals = ($testResult.assertionResults ?? []).flatMap((a) => a.visuals ?? []);

  // FIXME we need to free these URLs when the component is destroyed
  function getBlobUrl(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    return url;
  }

  async function copy() {
    if ($testResult.output?.length === 1 && typeof $testResult.output[0] === 'string') {
      await navigator.clipboard.writeText($testResult.output[0]);
    }
  }

  function openNotesDialog() {
    dispatch('open-notes', { index });
  }
</script>

<div
  class="relative overflow-hidden"
  class:max-h-48={$height === 'collapsed'}
  class:overflow-y-auto={$height === 'collapsed'}
>
  {#if $testResult.state === 'success'}
    <div
      class="mb-2 inline-block rounded-sm border border-green-700 bg-green-100 p-1 text-green-700"
    >
      PASS
    </div>
  {:else if $testResult.state === 'error'}
    <div class="mb-2 inline-block rounded-sm border border-red-700 bg-red-100 p-1 text-red-700">
      FAIL {errorMessage ? ' - ' + errorMessage : ''}
    </div>
  {:else}
    <div class="mb-2 inline-block rounded-sm border border-gray-700 bg-gray-100 p-1 text-gray-700">
      {$testResult.state === 'in-progress' ? 'IN PROGRESS' : 'WAITING'}
    </div>
  {/if}
  {#if $height !== 'minimal'}
    <!-- History -->
    {#if $testResult.history && $height === 'expanded'}
      <Accordion.Root multiple={true} class="mb-2">
        {#each $testResult.history as historyItem (historyItem.id)}
          <Accordion.Item value={historyItem.id}>
            <Accordion.Trigger class="py-1">
              {historyItem.id}
            </Accordion.Trigger>
            <Accordion.Content>
              <div class="whitespace-pre-wrap break-words">
                {#if historyItem.error}
                  {historyItem.error}
                {:else if historyItem.output}
                  <ResultOutput output={historyItem.output} />
                {:else}
                  --no output--
                {/if}
              </div>
              <ResultUsage result={historyItem} />
            </Accordion.Content>
          </Accordion.Item>
        {/each}
      </Accordion.Root>
    {/if}

    <!-- Output -->
    <div class="whitespace-pre-wrap break-words">
      {#if $testResult.error}
        {$testResult.error}
      {:else if $testResult.output}
        <ResultOutput output={$testResult.output} />
      {:else}
        --no output--
      {/if}
    </div>

    <!-- Buttons -->
    <div class="absolute right-0 top-0 flex">
      {#if ['success', 'error'].includes($testResult.state) && $testResult.output?.length === 1 && typeof $testResult.output[0] === 'string'}
        <Button on:click={copy} variant="ghost" size="icon" class="float-right text-gray-500">
          <Copy class="h-5 w-5"></Copy>
        </Button>
      {/if}
      <Button on:click={openRawPromptDialog} variant="ghost" size="icon" class="text-gray-500">
        <SquareCode class="h-5 w-5"></SquareCode>
      </Button>
      <Button
        on:click={openNotesDialog}
        variant="ghost"
        size="icon"
        class={$annotations?.notes?.value ? 'text-blue-500' : 'text-gray-500'}
      >
        <PencilIcon class="h-5 w-5"></PencilIcon>
      </Button>
    </div>

    <!-- Visuals -->
    {#if visuals.length > 0}
      <div class="mt-4">
        <h4 class="mb-2 text-sm font-semibold">Visuals:</h4>
        <div class="flex flex-col gap-2">
          {#each visuals as visual}
            {#if typeof visual === 'string'}
              <pre
                class="whitespace-pre-wrap break-words rounded bg-gray-100 p-2 text-sm">{visual}</pre>
            {:else if visual instanceof FileReference}
              <img
                src={getBlobUrl(visual.file)}
                alt="Assertion visual"
                class="h-auto max-w-full rounded"
              />
            {/if}
          {/each}
        </div>
      </div>
    {/if}
    <ResultUsage result={$testResult} />
  {/if}
</div>
