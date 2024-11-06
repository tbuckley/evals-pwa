<script lang="ts">
  import Button from '$lib/components/ui/button/button.svelte';
  import Textarea from '$lib/components/ui/textarea/textarea.svelte';
  import { loadStateFromStorage, setInMemoryConfig, setStorage } from '$lib/state/actions';
  import { configStore, storageStore } from '$lib/state/stores';
  import { FileSystemEvalsStorage } from '$lib/storage/FileSystemEvalsStorage';
  import { InMemoryStorage } from '$lib/storage/InMemoryStorage';
  import { WebFileSystemStorage } from '$lib/storage/WebFileSystemStorage';
  import dedent from 'dedent';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import * as yaml from 'yaml';
  import { decodeGzipB64, encodeGzipB64 } from '$lib/utils/encodeGzipB64';
  import { toast } from 'svelte-sonner';
  import { goto } from '$app/navigation';

  async function reload() {
    await loadStateFromStorage();
  }

  function handleTabKey(event: KeyboardEvent) {
    if (event.key === 'Tab') {
      event.preventDefault();
      const target = event.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;

      target.value = target.value.substring(0, start) + '  ' + target.value.substring(end);
      target.selectionStart = target.selectionEnd = start + 2;
    }
  }

  let savedConfig = $state('');
  let config = $state('');

  async function generateConfigUrl(data: string) {
    const encoded = await encodeGzipB64(data);
    const url = `${window.location.origin}/configuration?template=${encoded}`;

    // Some browsers have a maximum URL length of ~2048
    if (url.length > 2048) {
      toast('Configuration is too large for sharing via URL');
      return;
    }

    await navigator.clipboard.writeText(url);
    toast('Link copied to clipboard');
  }

  async function generateStoredConfigUrl() {
    // TODO warn/error if the config contains any file references?
    await generateConfigUrl(yaml.stringify($configStore));
  }

  onMount(async () => {
    const templateParam = $page.url.searchParams.get('template');
    if (templateParam) {
      // Load the storage from the URL
      const decodedConfig = await decodeGzipB64(templateParam);
      await setInMemoryConfig(decodedConfig);
      await loadStateFromStorage();
      config = decodedConfig;
      savedConfig = decodedConfig;

      // Remove from URL
      const newUrl = new URL($page.url);
      newUrl.searchParams.delete('template');
      await goto(newUrl, { replaceState: true });
    } else if (
      $storageStore instanceof FileSystemEvalsStorage &&
      $storageStore.fs instanceof InMemoryStorage
    ) {
      // Load the current InMemoryStorage config
      const file = await $storageStore.fs.loadFile('file:///evals.yaml');
      config = await file.text();
      savedConfig = config;
    }
  });

  async function handleSaveToInMemoryStorage() {
    await setInMemoryConfig(config);
    await loadStateFromStorage();
    savedConfig = config;
  }

  async function handleUseSample() {
    config = SAMPLE_CONFIG;
    await handleSaveToInMemoryStorage();
  }

  async function handleSwitchToInMemoryStorage() {
    config = '';
    savedConfig = '';
    await setStorage(null);
  }

  const SAMPLE_CONFIG = dedent`
		providers:
		  - gemini:gemini-1.5-pro-latest

		prompts:
		  - "write a couplet about {{topic}}"
		  - "write a haiku about {{topic}}"

		tests:
		  - vars:
		      topic: George Washington
	`;
</script>

<article class="prose">
  {#if $storageStore !== null && $storageStore instanceof FileSystemEvalsStorage && $storageStore.fs instanceof WebFileSystemStorage}
    <p>This page shows your current configuraton. Editing is not yet supported.</p>
    <Button on:click={reload}>Reload</Button>
    <Button on:click={generateStoredConfigUrl} variant="secondary">Share via link</Button>
    <Button variant="secondary" on:click={handleSwitchToInMemoryStorage}>Write a config</Button>

    <pre>{JSON.stringify($configStore, null, 2)}</pre>
  {:else}
    <p>To view your configuration, choose a folder or create a config below.</p>
    <Textarea
      bind:value={config}
      rows={10}
      class="font-mono"
      style="tab-size: 2;"
      on:keydown={handleTabKey}
    ></Textarea>
    <div class="mt-2 flex gap-2">
      <Button disabled={config === savedConfig} on:click={handleSaveToInMemoryStorage}
        >Use config</Button
      >
      <Button on:click={handleUseSample} variant="secondary">Use sample config</Button>
      <Button on:click={() => generateConfigUrl(config)} variant="secondary">Share via link</Button>
    </div>
  {/if}
</article>
