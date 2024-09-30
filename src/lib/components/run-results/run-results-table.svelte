<script lang="ts">
  import type { Env, LiveRun } from '$lib/types';
  import RunResultsCell from './run-results-cell.svelte';
  import RunResultsHeader from './run-results-header.svelte';
  import RunResultsVar from './run-results-var.svelte';
  import { showVarsColumnsStore } from '$lib/state/settings';
  import Label from '../ui/label/label.svelte';
  import Checkbox from '../ui/checkbox/checkbox.svelte';

  export let run: LiveRun;

  type HeaderCell = VarHeaderCell | EnvHeaderCell | LabelCell;
  type BodyCell = VarCell | ResultCell | LabelCell;

  interface VarHeaderCell {
    type: 'var';
    varName: string;
  }

  interface EnvHeaderCell {
    type: 'env'
    env: Env;
    summary: LiveRun['summaries'][number];
  }

  interface BodyRow {
    cells: Iterable<BodyCell>;
  }

  interface VarCell {
    type: 'var';
    var: string;
  }

  interface ResultCell {
    type: 'result';
    env: LiveRun['envs'][number];
    result: LiveRun['results'][number][number];
  }

  interface LabelCell {
    type: 'label';
    text: string;
  }

  function* headerCells(run: LiveRun): Generator<HeaderCell, void, void> {
    yield {
      type: 'label',
      text: 'Test',
    };
    for (const varName of run.varNames) {
      yield {
        type: 'var',
        varName,
      };
    }
    for (let i = 0; i < run.envs.length; i++) {
      yield {
        type: 'env',
        env: run.envs[i],
        summary: run.summaries[i],
      };
    }
  }

  function* bodyCells(run: LiveRun, i: number): Generator<BodyCell, void, void> {
    yield {
      type: 'label',
      text: run.tests[i].description ?? 'Test',
    }
    for (const varName of run.varNames) {
      yield {
        type: 'var',
        var: run.tests[i].vars?.[varName]
      };
    }
    let e = 0;
    for (const env of run.envs) {
      yield {
        type: 'result',
        result: run.results[i][e++],
        env,
      };
    }
  }

  function* bodyRows(run: LiveRun): Generator<BodyRow, void, void> {
    for (let i = 0; i < run.tests.length; i++) {
      yield {
        cells: {[Symbol.iterator]: () => bodyCells(run, i)},
      };
    }
  }

  $: header = {[Symbol.iterator]: () => headerCells(run)};
  $: body = {[Symbol.iterator]: () => bodyRows(run)};
</script>

<div class="mb-2 flex items-center gap-1.5">
  <Checkbox id="run-{run.id}-{run.timestamp}" bind:checked={$showVarsColumnsStore} />
  <Label for="run-{run.id}-{run.timestamp}">Show vars columns</Label>
</div>
<div class="rounded-md border">
  <table>
    <thead>
      {#each header as cell}
        {#if cell.type !== 'var' || $showVarsColumnsStore}
          <th
            class="text-left align-top font-medium text-muted-foreground"
          >
            {#if cell.type === 'label'}
              {cell.text}
            {:else if cell.type === 'var'}
              {cell.varName}
            {:else if cell.type === 'env'}
              <RunResultsHeader env={cell.env} summary={cell.summary}></RunResultsHeader>
            {/if}
          </th>
        {/if}
      {/each}
    </thead>
    <tbody>
      {#each body as row}
        <tr>
          {#each row.cells as cell}
            {#if cell.type !== 'var' || $showVarsColumnsStore}
              <td class="align-top">
                {#if cell.type === 'label'}
                  {cell.text}
                {:else if cell.type === 'var'}
                  <RunResultsVar value={cell.var}></RunResultsVar>
                {:else if cell.type === 'result'}
                  <RunResultsCell testResult={cell.result}></RunResultsCell>
                {/if}
              </td>
            {/if}
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
