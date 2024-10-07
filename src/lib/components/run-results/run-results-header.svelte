<script lang="ts">
  import type { RowHeight } from '$lib/state/settings';
  import type { Env } from '$lib/types';
  import type { Readable } from 'svelte/store';

  export let env: Env;
  export let height: Readable<RowHeight>;

  $: providerId = typeof env.provider === 'string' ? env.provider : env.provider.id;
</script>

<div class="flex flex-col gap-1">
  <div class="font-medium">
    {providerId}
  </div>
  <div
    class="overflow:hidden whitespace-pre-wrap text-sm text-muted-foreground"
    class:whitespace-nowrap={$height === 'minimal'}
    class:whitespace-pre-wrap={$height !== 'minimal'}
    class:max-w-lg={$height === 'minimal'}
    class:truncate={$height === 'minimal'}
    class:max-h-48={$height === 'collapsed'}
    class:overflow-y-auto={$height === 'collapsed'}
  >
    {env.prompt}
  </div>
</div>
