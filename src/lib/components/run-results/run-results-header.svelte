<script lang="ts">
  import type { RowHeight } from '$lib/state/settings';
  import type { Env } from '$lib/types';
  import type { Readable } from 'svelte/store';

  export let env: Env;
  export let height: Readable<RowHeight>;

  $: providerSummary = getProviderSummary(env);

  function getProviderSummary(env: Env): string {
    const parts: string[] = [];
    if (env.provider) {
      parts.push(typeof env.provider === 'string' ? env.provider : env.provider.id);
    }
    if (env.labeledProviders) {
      parts.push(
        ...Object.entries(env.labeledProviders).map(
          ([label, provider]) =>
            `${label}: ${typeof provider === 'string' ? provider : provider.id}`,
        ),
      );
    }
    return parts.join('\n');
  }
</script>

<div class="flex flex-col gap-1">
  <div class="whitespace-pre-wrap font-medium">{providerSummary}</div>
  <div
    class="overflow:hidden whitespace-pre-wrap text-sm text-muted-foreground"
    class:whitespace-nowrap={$height === 'minimal'}
    class:whitespace-pre-wrap={$height !== 'minimal'}
    class:max-w-lg={$height === 'minimal'}
    class:truncate={$height === 'minimal'}
    class:max-h-48={$height === 'collapsed'}
    class:overflow-y-auto={$height === 'collapsed'}
  >
    {typeof env.prompt === 'string' ? env.prompt : JSON.stringify(env.prompt, null, 2)}
  </div>
</div>
