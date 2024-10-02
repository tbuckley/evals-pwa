<script lang="ts">
  import Button from './ui/button/button.svelte';
  import Combobox from './Combobox.svelte';
  import { storageStore, configFilesStore, selectedConfigFileStore } from '$lib/state/stores';
  import {
    chooseFolder,
    loadStateFromStorage,
    saveInMemoryConfigToFileSystem,
  } from '$lib/state/actions';

  import Folder from 'lucide-svelte/icons/folder';
  import RefreshCcw from 'lucide-svelte/icons/refresh-ccw';
  import Save from 'lucide-svelte/icons/save';
  import { FileSystemEvalsStorage } from '$lib/storage/FileSystemEvalsStorage';
  import { InMemoryStorage } from '$lib/storage/InMemoryStorage';
  import { WebFileSystemStorage } from '$lib/storage/WebFileSystemStorage';

  async function handleConfigChange(event: CustomEvent<string>) {
    $selectedConfigFileStore = event.detail;
    await loadStateFromStorage();
  }
</script>

{#if $storageStore === null}
  <Button class="gap-2" variant="ghost" on:click={chooseFolder}>
    <Folder class="h-4 w-4"></Folder>
    Choose a folder
  </Button>
{:else if $storageStore instanceof FileSystemEvalsStorage && $storageStore.fs instanceof WebFileSystemStorage}
  <div class="flex items-center gap-2">
    <Button class="gap-2" variant="secondary" on:click={chooseFolder}>
      <Folder class="h-4 w-4"></Folder>
      {$storageStore.getName()}
    </Button>
    {#if $configFilesStore.length > 1}
      <Combobox
        items={$configFilesStore.map((configFile) => ({ value: configFile, label: configFile }))}
        value={$selectedConfigFileStore}
        placeholder="Select config file"
        on:select={handleConfigChange}
      />
    {/if}
    <Button on:click={loadStateFromStorage} variant="secondary" size="icon" class="rounded-full">
      <RefreshCcw class="h-4 w-4"></RefreshCcw>
    </Button>
  </div>
{:else if $storageStore instanceof FileSystemEvalsStorage && $storageStore.fs instanceof InMemoryStorage}
  <Button class="gap-2" variant="destructive" on:click={() => saveInMemoryConfigToFileSystem()}>
    <Save class="h-4 w-4"></Save>
    Save config
  </Button>
{/if}
