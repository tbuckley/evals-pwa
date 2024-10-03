<script lang="ts">
  import { type Writable } from 'svelte/store';
  import ChevronUp from 'lucide-svelte/icons/chevron-up';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';

  export let height: Writable<'minimal' | 'collapsed' | 'expanded'>;
  export let cycle: () => void;
</script>

<button on:click={cycle}>
  {#if $height === 'minimal'}
    <ChevronUp class="h-5 w-5"></ChevronUp>
  {:else if $height === 'collapsed'}
    <ChevronRight class="h-5 w-5"></ChevronRight>
  {:else}
    <ChevronDown class="h-5 w-5"></ChevronDown>
  {/if}
</button>
