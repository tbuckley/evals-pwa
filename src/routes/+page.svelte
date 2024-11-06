<script lang="ts">
  import { preventDefault } from 'svelte/legacy';

  import Combobox from '$lib/components/Combobox.svelte';
  import RunResultsTable from '$lib/components/run-results/run-results-table.svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import { chooseFolder, runTests } from '$lib/state/actions';
  import {
    abortRunStore,
    hasTestsMarkedOnlyStore,
    runTitleListStore,
    selectedRunStore,
    selectedRunTitle,
  } from '$lib/state/derived';
  import { configStore, selectedRunIdStore } from '$lib/state/stores';
  import { resultDialogStore } from '$lib/state/ui';
  import * as Dialog from '$lib/components/ui/dialog';
  import CancelIcon from 'lucide-svelte/icons/ban';
  import * as Alert from '$lib/components/ui/alert';
  import Filter from 'lucide-svelte/icons/filter';

  function setSelectedRunId(id: unknown) {
    if (id !== null && typeof id !== 'string') {
      throw new Error('Invalid id for selectedRunIdStore');
    }
    selectedRunIdStore.set(id);
  }
</script>

<article class="prose">
  {#if $configStore === null}
    <h1>Welcome to Evals!</h1>
    <p>
      You can evaluate popular LLM models using your own prompts and test cases, all from within
      your browser. Apart from requests directly to the LLM providers (like OpenAI or Google), no
      data ever leaves your device. Your configuration is stored on your file system, and API keys
      are saved to your browser's local storage.
    </p>
    <h2>Getting started</h2>
    <p>
      To get started, <a href="##" onclick={preventDefault(chooseFolder)}>choose a folder</a>
      containing a <code>config.yaml</code> file that looks like this:
    </p>
    <pre>
# An optional short description to help identify outputs
description: My first eval

# One or more prompts you are testing
prompts:
  - "Respond like a pirate to this request: {'{{request}}'}"
  - "Respond with a haiku to this request: {'{{request}}'}"

# One or more providers you want to use for running the prompts
providers:
  - gemini:gemini-1.5-pro-latest
  - openai:gpt-4o

# Tests provide values to feed into the prompts, and
# checks to make sure the output is right
tests:
  - description: foo
    vars:
      request: Who was the first US president?
    assert:
      - type: contains
        vars:
          needle: washington
          ignoreCase: true
</pre>
    <p>
      For more details, check out the <a href="/documentation">documentation</a>.
    </p>
  {:else}
    <Button on:click={runTests}>Run tests</Button>
    {#if $abortRunStore !== null}
      <Button variant="secondary" on:click={$abortRunStore}>Cancel run</Button>
    {/if}

    {#if $hasTestsMarkedOnlyStore}
      <Alert.Root class="mt-2">
        <Filter class="h-4 w-4"></Filter>
        <Alert.Title>Limiting to specific tests</Alert.Title>
        <Alert.Description>
          Some tests are marked as <span class="rounded-sm bg-gray-100 p-1 font-mono text-[0.9em]"
            >only: true</span
          >, so only those will be run.
        </Alert.Description>
      </Alert.Root>
    {/if}
  {/if}
</article>

{#if $runTitleListStore.length > 0}
  <div>
    <Combobox
      items={$runTitleListStore.map((run) => ({
        value: run.id,
        label: run.title,
      }))}
      value={$selectedRunIdStore ?? ''}
      on:select={(e) => {
        setSelectedRunId(e.detail);
      }}
    ></Combobox>

    {#if $selectedRunStore !== null}
      <h2 class="mb-4 mt-8 flex items-center gap-2 text-xl font-bold">
        <div>{$selectedRunTitle}</div>
        {#if $selectedRunStore.canceled}
          <div
            class="inline-flex items-center gap-1 rounded-md border border-red-500 bg-red-50 px-1 text-red-500"
          >
            <CancelIcon class="inline-block h-5 w-5"></CancelIcon>
            Canceled
          </div>
        {/if}
      </h2>

      <!-- Use a keyed block so we don't try to reuse a table that was created with a different layout -->
      {#key $selectedRunStore.id}
        <RunResultsTable run={$selectedRunStore} />
      {/key}
    {/if}
  </div>
{/if}

<!-- Keep the global dialog component -->
<Dialog.Root
  open={$resultDialogStore.result !== null}
  onOpenChange={(open) => {
    resultDialogStore.update((state) => ({ ...state, result: open ? state.result : null }));
  }}
>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>{$resultDialogStore.title}</Dialog.Title>
      <Dialog.Description>View the raw prompt and output for a test result.</Dialog.Description>
    </Dialog.Header>
    <div class="max-h-[50vh] overflow-y-scroll">
      <h3 class="my-2 font-bold">Prompt</h3>
      <pre class="whitespace-pre-wrap rounded-md bg-gray-100 p-2">{JSON.stringify(
          $resultDialogStore.result?.rawPrompt,
          null,
          2,
        )}</pre>
      <h3 class="my-2 font-bold">Output</h3>
      <pre class="whitespace-pre-wrap rounded-md bg-gray-100 p-2">{JSON.stringify(
          $resultDialogStore.result?.rawOutput,
          null,
          2,
        )}</pre>
    </div>
  </Dialog.Content>
</Dialog.Root>
