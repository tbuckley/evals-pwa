<script lang="ts">
  import type { LiveResult } from '$lib/types';
  import type { Readable } from 'svelte/store';
  import { resultDialogStore } from '$lib/state/ui';
  import Button from '../ui/button/button.svelte';
  import SquareCode from 'lucide-svelte/icons/square-code';
  import { FileReference } from '$lib/storage/FileReference';

  export let testResult: Readable<LiveResult>;
  export let height: Readable<'minimal' | 'collapsed' | 'expanded'>;

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
    <div class="whitespace-pre-wrap break-words">
      {$testResult.error ?? $testResult.output ?? '--no output--'}
    </div>
    <Button
      on:click={openRawPromptDialog}
      variant="ghost"
      size="icon"
      class="absolute right-0 top-0 text-gray-500"
    >
      <SquareCode class="h-5 w-5"></SquareCode>
    </Button>
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
    {#if typeof $testResult.latencyMillis === 'number'}
      <div class="mt-2 text-xs font-bold text-gray-500">{$testResult.latencyMillis}ms</div>
    {/if}
    {#if typeof $testResult.tokenUsage === 'object'}
      <div class="mt-2 text-xs font-bold text-gray-500">
        {#if $testResult.tokenUsage.inputTokens && $testResult.tokenUsage.outputTokens}
          <span>
            ({$testResult.tokenUsage.inputTokens}+{$testResult.tokenUsage.outputTokens})
          </span>
        {/if}
        {#if $testResult.tokenUsage.costDollars}
          <span>
            ${$testResult.tokenUsage.costDollars.toFixed(4)}
          </span>
        {/if}
      </div>
    {/if}
  {/if}
</div>
