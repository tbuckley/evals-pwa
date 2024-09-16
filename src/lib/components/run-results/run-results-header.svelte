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
  <div>{providerId}</div>
  <div>{env.prompt}</div>
  <div>{passRate.toFixed(2)}% pass</div>
  {#if $summary.avgLatencyMillis}
    <div>{Math.round($summary.avgLatencyMillis)}ms avg latency</div>
  {/if}
  {#if $summary.avgCostDollars}
    <div>${$summary.avgCostDollars.toFixed(4)} avg cost</div>
  {/if}
</div>
