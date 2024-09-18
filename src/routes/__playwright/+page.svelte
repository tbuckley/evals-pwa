<script lang="ts">
  import { setStorageDirectory } from '$lib/state/actions';

  // Use OPFS, since Playwright doesn't support the File System Access API
  async function useOpfs() {
    const dir = await navigator.storage.getDirectory();
    await setStorageDirectory(dir);
  }
</script>

<button on:click={useOpfs}>Use OPFS</button>
