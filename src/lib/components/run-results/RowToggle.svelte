<script lang="ts">
  import { type Writable } from 'svelte/store';
  import ChevronUp from 'lucide-svelte/icons/chevron-up';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import Button from '../ui/button/button.svelte';

  export let height: Writable<'minimal' | 'collapsed' | 'expanded'>;
  export let cycle: () => void;
</script>

<Button on:click={cycle} variant="ghost" size="icon" class="text-gray-500" {...$$restProps}>
  {#if $height === 'minimal'}
    <ChevronUp class="h-5 w-5"></ChevronUp>
  {:else if $height === 'collapsed'}
    <ChevronRight class="h-5 w-5"></ChevronRight>
  {:else}
    <ChevronDown class="h-5 w-5"></ChevronDown>
  {/if}
</Button>
