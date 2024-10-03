<script lang="ts">
  import type { Env } from '$lib/types';

  export let env: Env;

  $: providerId = typeof env.provider === 'string' ? env.provider : env.provider.id;
</script>

<div class="flex flex-col gap-1">
  <div class="font-medium">
    {providerId}
  </div>
  <div class="whitespace-pre-wrap text-sm text-muted-foreground">
    {env.prompt}
  </div>
</div>
