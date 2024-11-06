<script lang="ts">
  import { loadStateFromStorage, setStorageDirectory } from '$lib/state/actions';

  // Use OPFS, since Playwright doesn't support the File System Access API
  async function useOpfs() {
    const dir = await navigator.storage.getDirectory();
    await setStorageDirectory(dir);
    await loadStateFromStorage();
  }
</script>

<button onclick={useOpfs}>Use OPFS</button>
