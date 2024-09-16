<script lang="ts">
  import Check from 'lucide-svelte/icons/check';
  import ChevronsUpDown from 'lucide-svelte/icons/chevrons-up-down';
  import { createEventDispatcher, tick } from 'svelte';
  import * as Command from '$lib/components/ui/command/index.js';
  import * as Popover from '$lib/components/ui/popover/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { cn } from '$lib/utils/shadcn.js';

  export let items: { value: string; label: string }[] = [];
  export let value = '';
  export let placeholder = 'Select...';
  export let searchPlaceholder = 'Search...';
  export let empty = 'No matches found.';

  const dispatch = createEventDispatcher();
  let open = false;

  $: selectedValue = items.find((f) => f.value === value)?.label ?? placeholder;

  // We want to refocus the trigger button when the user selects
  // an item from the list so users can continue navigating the
  // rest of the form with the keyboard.
  function closeAndFocusTrigger(triggerId: string) {
    open = false;
    tick().then(() => {
      document.getElementById(triggerId)?.focus();
    });
  }
</script>

<Popover.Root bind:open let:ids>
  <Popover.Trigger asChild let:builder>
    <Button
      builders={[builder]}
      variant="outline"
      role="combobox"
      aria-expanded={open}
      class="w-auto justify-between"
    >
      {selectedValue}
      <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
    </Button>
  </Popover.Trigger>
  <Popover.Content class="w-auto p-0" align="start">
    <Command.Root>
      <Command.Input placeholder={searchPlaceholder} />
      <Command.Empty>{empty}</Command.Empty>
      <Command.Group>
        {#each items as item}
          <Command.Item
            onSelect={() => {
              dispatch('select', item.value);
              closeAndFocusTrigger(ids.trigger);
            }}
          >
            <Check class={cn('mr-2 h-4 w-4', value !== item.value && 'text-transparent')} />
            {item.label}
          </Command.Item>
        {/each}
      </Command.Group>
    </Command.Root>
  </Popover.Content>
</Popover.Root>
