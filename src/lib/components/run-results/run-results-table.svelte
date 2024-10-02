<script lang="ts">
  import type { Env, LiveRun } from '$lib/types';
  import RunResultsCell from './run-results-cell.svelte';
  import RunResultsHeader from './run-results-header.svelte';
  import RunResultsVar from './run-results-var.svelte';
  import RowToggle from './RowToggle.svelte';
  import { showVarsColumnsStore } from '$lib/state/settings';
  import Label from '../ui/label/label.svelte';
  import Checkbox from '../ui/checkbox/checkbox.svelte';
  import { get, writable, type Writable } from 'svelte/store';
  import RunResultsSummary from './run-results-summary.svelte';

  export let run: LiveRun;

  type HeaderCell = VarHeaderCell | EnvHeaderCell | LabelCell | ToggleHeightCell;
  type BodyCell = VarCell | ResultCell | LabelCell | ToggleHeightCell;
  type RowHeight = 'minimal' | 'collapsed' | 'expanded';

  interface VarHeaderCell {
    type: 'var';
    varName: string;
  }

  interface EnvHeaderCell {
    type: 'env';
    env: Env;
    summary: LiveRun['summaries'][number];
  }

  interface BodyRow {
    cells: Iterable<BodyCell>;
    rowHeight: Writable<RowHeight>;
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

  interface ToggleHeightCell {
    type: 'height';
  }

  function* headerCells(run: LiveRun): Generator<HeaderCell, void, void> {
    yield {
      type: 'height',
    };
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
      type: 'height',
    };
    yield {
      type: 'label',
      text: run.tests[i].description ?? 'Test',
    };
    for (const varName of run.varNames) {
      yield {
        type: 'var',
        var: run.tests[i].vars?.[varName],
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
        cells: [...bodyCells(run, i)],
        rowHeight: writable(get(globalRowHeight)),
      };
    }
  }

  function cycleRowHeight(target: Writable<RowHeight>) {
    target.update((current) => {
      if (current === 'minimal') {
        return 'collapsed';
      } else if (current === 'collapsed') {
        return 'expanded';
      } else {
        return 'minimal';
      }
    });
    if (target === globalRowHeight) {
      const result = get(globalRowHeight);
      for (const row of body) {
        row.rowHeight.set(result);
      }
    }
  }

  let globalRowHeight = writable<RowHeight>('expanded');

  $: header = [...headerCells(run)];
  $: body = [...bodyRows(run)];
</script>

<div class="mb-2 flex items-center gap-1.5">
  <Checkbox id="run-{run.id}-{run.timestamp}" bind:checked={$showVarsColumnsStore} />
  <Label for="run-{run.id}-{run.timestamp}">Show vars columns</Label>
</div>
<button
  on:click={() => {
    cycleRowHeight(globalRowHeight);
  }}
>
  Global Toggle: {$globalRowHeight}
</button>
<div class="rounded-md border">
  <table>
    <thead>
      <tr>
        {#each header as cell}
          {#if cell.type !== 'var' || $showVarsColumnsStore}
            <th class="p-1 text-left align-top font-medium text-muted-foreground">
              {#if cell.type === 'label'}
                {cell.text}
              {:else if cell.type === 'var'}
                {cell.varName}
              {:else if cell.type === 'env'}
                <RunResultsHeader env={cell.env} />
              {/if}
            </th>
          {/if}
        {/each}
      </tr>
    </thead>
    <tbody>
      <tr>
        {#each header as cell}
          {#if cell.type !== 'var' || $showVarsColumnsStore}
            {#if cell.type === 'env'}
              <td class="p-1 align-top">
                <RunResultsSummary summary={cell.summary} />
              </td>
            {:else}
              <td></td>
            {/if}
          {/if}
        {/each}
      </tr>
      {#each body as row}
        <tr>
          {#each row.cells as cell}
            {#if cell.type !== 'var' || $showVarsColumnsStore}
              <td class="p-1 align-top">
                {#if cell.type === 'label'}
                  {cell.text}
                {:else if cell.type === 'height'}
                  <RowToggle height={row.rowHeight} cycle={() => cycleRowHeight(row.rowHeight)} />
                {:else if cell.type === 'var'}
                  <RunResultsVar value={cell.var} height={row.rowHeight} />
                {:else if cell.type === 'result'}
                  <RunResultsCell testResult={cell.result} height={row.rowHeight} />
                {/if}
              </td>
            {/if}
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
