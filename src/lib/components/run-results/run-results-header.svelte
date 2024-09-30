<script lang="ts">
  import type { Env, SummaryStats } from '$lib/types';
  import type { Readable } from 'svelte/store';

  export let env: Env;
  export let summary: Readable<SummaryStats>;

  $: providerId = typeof env.provider === 'string' ? env.provider : env.provider.id;

  $: totalResults = $summary.passed + $summary.failed;
  $: passRate = totalResults > 0 ? ($summary.passed / totalResults) * 100 : 0;
</script>

<div>
  <div class="mb-2">
    {providerId}
  </div>
  <div class="mb-2 whitespace-pre-wrap">
    {env.prompt}
  </div>
  <div class="mb-2">
    <div class="font-semibold">
      {passRate.toFixed(2)}% pass [{$summary.passed}/{totalResults}]
      {#if $summary.total > totalResults}
        <div>{$summary.total - totalResults} pending</div>
      {/if}
    </div>
    {#if $summary.assertions.length}
      <ul class="list-inside">
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
  </div>

  <div>
    {#if $summary.avgLatencyMillis}
      <div>{Math.round($summary.avgLatencyMillis)}ms avg latency</div>
    {/if}
    {#if $summary.avgCostDollars}
      <div>${$summary.avgCostDollars.toFixed(4)} avg cost</div>
    {/if}
  </div>
</div>
