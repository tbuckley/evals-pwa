<script lang="ts">
  import { type Readable} from 'svelte/store';
  import { type RowSizeProps } from '../ui/table/addRowSize';
  import ChevronUp from 'lucide-svelte/icons/chevron-up';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';

  export let props: Readable<{rowSize: RowSizeProps}>;
</script>

<button on:click={$props.rowSize.toggle}>
  {#if $props.rowSize.state === 'minimal'}
    <ChevronUp class="h-5 w-5"></ChevronUp>
  {:else if $props.rowSize.state === 'collapsed'}
    <ChevronRight class="h-5 w-5"></ChevronRight>
  {:else}
    <ChevronDown class="h-5 w-5"></ChevronDown>
  {/if}
</button>
