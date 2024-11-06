<script lang="ts">
  import type { RowHeight } from '$lib/state/settings';
  import type { SummaryStats } from '$lib/types';
  import { type Readable } from 'svelte/store';

  interface Props {
    summary: Readable<SummaryStats>;
    height: Readable<RowHeight>;
  }

  let { summary, height }: Props = $props();

  let totalResults = $derived($summary.passed + $summary.failed);
  let passRate = $derived(totalResults > 0 ? ($summary.passed / totalResults) * 100 : 0);
</script>

<div
  class="flex flex-col gap-0.5"
  class:max-h-48={$height === 'collapsed'}
  class:overflow-y-auto={$height === 'collapsed'}
>
  <div class="font-semibold">
    {passRate.toFixed(2)}% pass [{$summary.passed}/{totalResults}]
    {#if $summary.total > totalResults}
      <div class="text-sm text-muted-foreground">
        {$summary.total - totalResults} pending
      </div>
    {/if}
  </div>
  {#if $summary.assertions.length && $height !== 'minimal'}
    <ul class="list-inside text-sm text-muted-foreground">
      {#each $summary.assertions as assertion}
        <li>
          <span>{assertion.description}: {Math.round(assertion.avgPass * 100)}% pass</span>
          <ul class="ml-4 list-inside">
            {#each Object.keys(assertion.outputStats) as key}
              {#if assertion.outputStats[key].type == 'boolean'}
                <li>
                  <span>{key}:</span>
                  {Math.round(assertion.outputStats[key].avgTrue * 100)}% true
                </li>
              {/if}

              {#if assertion.outputStats[key].type === 'number'}
                <li>
                  <span>{key}:</span>
                  {assertion.outputStats[key].avgNumber.toFixed(2)} avg
                </li>
              {/if}
            {/each}
          </ul>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="flex gap-2 text-xs text-muted-foreground">
    {#if $summary.avgLatencyMillis}
      <div>{Math.round($summary.avgLatencyMillis)}ms avg latency</div>
    {/if}
    {#if $summary.avgCostDollars}
      <div>${$summary.avgCostDollars.toFixed(4)} avg cost</div>
    {/if}
  </div>
</div>
