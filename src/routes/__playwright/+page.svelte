<script lang="ts">
  import { setStorageDirectory } from '$lib/state/actions';
  import { CodeSandbox } from '$lib/utils/CodeSandbox';
  import { onDestroy, onMount } from 'svelte';

  // Expose any classes globally for Playwright testing

  onMount(() => {
    (window as any).__dev = {
      CodeSandbox,
    };
  });
  onDestroy(() => {
    (window as any).__dev = undefined;
  });

  // Use OPFS, since Playwright doesn't support the File System Access API
  async function useOpfs() {
    const dir = await navigator.storage.getDirectory();
    setStorageDirectory(dir);
  }
</script>

<button on:click={useOpfs}>Use OPFS</button>
