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
  import RunResultsSized from './RunResultsSized.svelte';
  import GripVertical from 'lucide-svelte/icons/grip-vertical';


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

  function bodyCells(run: LiveRun, i: number): BodyCell[] {
    return [
      {
        type: 'height',
      },
      {
        type: 'label',
        text: run.tests[i].description ?? 'Test',
      },
      ...run.varNames.map((varName) => ({
        type: 'var',
        var: run.tests[i].vars?.[varName],
      } as VarCell)),
      ...run.envs.map((env, e) => ({
        type: 'result',
        result: run.results[i][e++],
        env,
      } as ResultCell)),
    ];
  }

  function* bodyRows(run: LiveRun): Generator<BodyRow, void, void> {
    for (let i = 0; i < run.tests.length; i++) {
      yield {
        cells: bodyCells(run, i),
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

  function resizeDown(e: PointerEvent) {
    (e.target as HTMLDivElement).setPointerCapture(e.pointerId);
  }
  function resizeMove(e: PointerEvent, width: Writable<number | undefined>) {
    if (!(e.target as HTMLDivElement).hasPointerCapture(e.pointerId)) return;
    width.update((width) => (width ?? 0) + e.movementX);
  }

  let globalRowHeight = writable<RowHeight>('expanded');

  $: header = [...headerCells(run)];
  $: body = [...bodyRows(run)];
  $: columnWidths = header.map((_, i) => writable(i > 1 ? 300 : undefined));
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
<div class="rounded-md border w-[fit-content]">
  <table>
    <thead>
      <tr class="border-b transition-colors hover:bg-muted/50">
        {#each header as cell, i}
          {#if cell.type !== 'var' || $showVarsColumnsStore}
            <th class="p-1 text-left align-top font-medium text-muted-foreground relative">
              <RunResultsSized width={columnWidths[i]}>
                {#if cell.type === 'label'}
                  {cell.text}
                {:else if cell.type === 'var'}
                  {cell.varName}
                {:else if cell.type === 'env'}
                  <RunResultsHeader env={cell.env} />
                {/if}
                {#if i > 1}
                <div class="absolute right-0 top-1 z-10 w-4 cursor-col-resize"
                  on:pointerdown={resizeDown}
                  on:pointermove={(e) => resizeMove(e, columnWidths[i])}
                >
                  <GripVertical class="h-4 w-4"></GripVertical>
                </div>
                {/if}
              </RunResultsSized>
            </th>
          {/if}
        {/each}
      </tr>
    </thead>
    <tbody>
      <tr class="border-b transition-colors hover:bg-muted/50">
        {#each header as cell, i}
          {#if cell.type !== 'var' || $showVarsColumnsStore}
            <td class="p-1 align-top">
              <RunResultsSized width={columnWidths[i]}>
                {#if cell.type === 'env'}
                  <RunResultsSummary summary={cell.summary} />
                {/if}
              </RunResultsSized>
            </td>
          {/if}
        {/each}
      </tr>
      {#each body as row}
        <tr class="border-b transition-colors hover:bg-muted/50">
          {#each row.cells as cell, i}
            {#if cell.type !== 'var' || $showVarsColumnsStore}
              <td class="p-1 align-top">
                <RunResultsSized width={columnWidths[i]}>
                  {#if cell.type === 'label'}
                    {cell.text}
                  {:else if cell.type === 'height'}
                    <RowToggle height={row.rowHeight} cycle={() => cycleRowHeight(row.rowHeight)} />
                  {:else if cell.type === 'var'}
                    <RunResultsVar value={cell.var} height={row.rowHeight} />
                  {:else if cell.type === 'result'}
                    <RunResultsCell testResult={cell.result} height={row.rowHeight} />
                  {/if}
                </RunResultsSized>
              </td>
            {/if}
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
