<script lang="ts">
  import { type Writable } from 'svelte/store';

  export let width: Writable<number | undefined>;
</script>

<div class="overflow-hidden" style:width={$width ? $width + 'px' : 'auto'}>
  <slot />
</div>
