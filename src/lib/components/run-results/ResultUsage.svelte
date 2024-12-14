<script lang="ts">
  import type { TokenUsage } from '$lib/types';

  export let result: { latencyMillis?: number; tokenUsage?: TokenUsage };
</script>

{#if typeof result.latencyMillis === 'number'}
  <div class="mt-2 text-xs font-bold text-gray-500">{result.latencyMillis}ms</div>
{/if}
{#if typeof result.tokenUsage === 'object'}
  <div class="mt-2 text-xs font-bold text-gray-500">
    {#if result.tokenUsage.inputTokens && result.tokenUsage.outputTokens}
      <span>
        ({result.tokenUsage.inputTokens}+{result.tokenUsage.outputTokens})
      </span>
    {/if}
    {#if result.tokenUsage.costDollars}
      <span>
        ${result.tokenUsage.costDollars.toFixed(4)}
      </span>
    {/if}
  </div>
{/if}
