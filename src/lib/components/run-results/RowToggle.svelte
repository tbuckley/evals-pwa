<script lang="ts">
  import { type Writable } from 'svelte/store';
  import ChevronUp from 'lucide-svelte/icons/chevron-up';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import Button from '../ui/button/button.svelte';

  interface Props {
    height: Writable<'minimal' | 'collapsed' | 'expanded'>;
    cycle: () => void;
    [key: string]: any;
  }

  let { height, cycle, ...rest }: Props = $props();
</script>

<Button on:click={cycle} variant="ghost" size="sm" class="text-gray-500" {...rest}>
  {#if $height === 'minimal'}
    <ChevronUp class="h-5 w-5"></ChevronUp>
  {:else if $height === 'collapsed'}
    <ChevronRight class="h-5 w-5"></ChevronRight>
  {:else}
    <ChevronDown class="h-5 w-5"></ChevronDown>
  {/if}
</Button>
