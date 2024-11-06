<script lang="ts">
  import { type Writable } from 'svelte/store';

  interface Props {
    width: Writable<number | undefined>;
    children?: import('svelte').Snippet;
  }

  let { width, children }: Props = $props();
</script>

<div class="overflow-hidden" style:width={$width ? `${$width}px` : 'auto'}>
  {@render children?.()}
</div>
