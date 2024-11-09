<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { parsedEnvStore, requiredEnvStore } from '$lib/state/derived';
  import { envStore } from '$lib/state/env';
  import { createEventDispatcher } from 'svelte';
  import EnvEditor from './env-editor.svelte';
  import Button from './ui/button/button.svelte';
  import { Checkbox } from './ui/checkbox';
  import { Label } from './ui/label';
  import { useCacheStore } from '$lib/state/settings';

  export let open = false;
  export let canClose = true;

  const dispatch = createEventDispatcher();

  $: envEditorEntries = getEnvEditorEntries($requiredEnvStore, open);
  function getEnvEditorEntries(requiredEnv: string[], _open: boolean): [string, string][] {
    return requiredEnv.map((req) => [req, $parsedEnvStore[req]]);
  }

  function saveEnv() {
    const newEnv = { ...$parsedEnvStore };
    for (const [key, value] of envEditorEntries) {
      newEnv[key] = value;
    }
    envStore.set(
      Object.entries(newEnv)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n'),
    );
    dispatchOpenState(false);
  }

  function dispatchOpenState(open: boolean) {
    dispatch('open-change', open);
  }
</script>

<Dialog.Root
  {open}
  closeOnEscape={canClose}
  closeOnOutsideClick={canClose}
  onOpenChange={dispatchOpenState}
>
  <Dialog.Content id="env-editor" hideCloseButton={!canClose}>
    <Dialog.Header>
      <Dialog.Title>Settings</Dialog.Title>
      <Dialog.Description>Configure your environment</Dialog.Description>
    </Dialog.Header>
    <div>
      <EnvEditor entries={envEditorEntries}></EnvEditor>
      <hr />
      <div class="my-4">
        <div class="my-1 flex items-center gap-2">
          <Checkbox id="use-cache" bind:checked={$useCacheStore}></Checkbox>
          <Label for="use-cache">Use cache</Label>
        </div>
        <div class="text-sm text-gray-500">
          When enabled, responses are cached to reduce latency and cost when re-running the same
          prompt.
        </div>
      </div>
    </div>
    <Dialog.Footer>
      <Button type="submit" on:click={saveEnv}>Save changes</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
