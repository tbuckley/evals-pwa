<script lang="ts">
  import type { Env, LiveRun } from '$lib/types';
  import RunResultsCell from './run-results-cell.svelte';
  import RunResultsHeader from './run-results-header.svelte';
  import RunResultsVar from './run-results-var.svelte';
  import RowToggle from './RowToggle.svelte';
  import {
    showVarsColumnsStore,
    showOnlyFailuresStore,
    rowHeightStore,
    headerRowHeightStore,
    summaryRowHeightStore,
    type RowHeight,
  } from '$lib/state/settings';
  import Label from '../ui/label/label.svelte';
  import Checkbox from '../ui/checkbox/checkbox.svelte';
  import { get, writable, type Writable } from 'svelte/store';
  import RunResultsSummary from './run-results-summary.svelte';
  import RunResultsSized from './RunResultsSized.svelte';
  import GripVertical from 'lucide-svelte/icons/grip-vertical';
  import { Button } from '../ui/button';

  export let run: LiveRun;

  type HeaderCell = VarHeaderCell | EnvHeaderCell | LabelCell | ToggleHeightCell;
  type BodyCell = VarCell | ResultCell | LabelCell | ToggleHeightCell;

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
    hasFailures: boolean;
    cells: Iterable<BodyCell>;
    rowHeight: Writable<RowHeight>;
  }

  interface VarCell {
    type: 'var';
    var: unknown;
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
      ...run.varNames.map(
        (varName) =>
          ({
            type: 'var',
            var: run.tests[i].vars?.[varName],
          }) as VarCell,
      ),
      ...run.envs.map(
        (env, e) =>
          ({
            type: 'result',
            result: run.results[i][e++],
            env,
          }) as ResultCell,
      ),
    ];
  }

  function* bodyRows(run: LiveRun): Generator<BodyRow, void, void> {
    for (let i = 0; i < run.tests.length; i++) {
      yield {
        hasFailures: run.results[i].some((env) => get(env).state === 'error'),
        cells: bodyCells(run, i),
        rowHeight: writable(get(rowHeightStore)),
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
    if (target === rowHeightStore) {
      const result = get(rowHeightStore);
      for (const row of body) {
        row.rowHeight.set(result);
      }
    }
  }

  function resizeDown(e: PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
  }
  function resizeMove(e: PointerEvent, width: Writable<number | undefined>) {
    if (!(e.target as Element).hasPointerCapture(e.pointerId)) return;
    function defaultWidth() {
      let element = e.target as Element | null;
      while (element && !['TD', 'TH'].includes(element.tagName)) {
        element = element.parentElement;
      }
      return element?.firstElementChild?.clientWidth ?? 0;
    }
    width.update((width) => (width ?? defaultWidth()) + e.movementX);
  }

  $: header = [...headerCells(run)];
  $: body = [...bodyRows(run)];
  $: columnWidths = header.map(() => writable<number | undefined>(undefined));

  function downloadCsv() {
    const providerHeaders = run.envs.map((env) => {
      if (typeof env.provider === 'string') {
        return env.provider;
      } else if (env.provider !== null) {
        return env.provider.id;
      } else {
        return 'unknown';
      }
    });
    const promptHeaders = run.envs.map((env) =>
      typeof env.prompt === 'string' ? env.prompt : JSON.stringify(env.prompt, null, 2),
    );
    const rows = [];
    for (let i = 0; i < run.results.length; i++) {
      const test = run.tests[i];
      const testResults = run.results[i].map((col) => {
        const result = get(col);
        if (result.error) {
          return result.error;
        }
        if (typeof result.output === 'string') {
          return result.output;
        }
        if (Array.isArray(result.output)) {
          return result.output
            .map((item) => (typeof item === 'string' ? item : `![](${item.uri})`))
            .join('');
        }
        return '--no output--';
      });
      rows.push([test.description ?? 'Test', ...testResults]);
    }
    const csv = [['Provider', ...providerHeaders], ['Prompt', ...promptHeaders], ...rows]
      .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(','))
      .join('\n');

    // Create blob and download link
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eval-results-${run.id}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
</script>

<div class="mb-2 flex items-center gap-4">
  <div class="flex items-center gap-1.5">
    <RowToggle
      id="height-run-{run.id}-{run.timestamp}"
      height={rowHeightStore}
      cycle={() => {
        cycleRowHeight(rowHeightStore);
      }}
    />
    <Label for="height-run-{run.id}-{run.timestamp}">Toggle row height</Label>
  </div>
  <div class="flex items-center gap-1.5">
    <Checkbox id="vars-run-{run.id}-{run.timestamp}-vars" bind:checked={$showVarsColumnsStore} />
    <Label for="vars-run-{run.id}-{run.timestamp}-vars">Show vars columns</Label>
  </div>
  <div class="flex items-center gap-1.5">
    <Checkbox
      id="vars-run-{run.id}-{run.timestamp}-failures"
      bind:checked={$showOnlyFailuresStore}
    />
    <Label for="vars-run-{run.id}-{run.timestamp}-failures">Show only failures</Label>
  </div>
  <Button variant="secondary" on:click={downloadCsv}>Download CSV</Button>
</div>
<div class="w-[fit-content] rounded-md border pr-40 text-sm">
  <table>
    <thead>
      <tr class="border-b transition-colors hover:bg-muted/50">
        {#each header as cell, i}
          {#if cell.type !== 'var' || $showVarsColumnsStore}
            <th class="relative p-1 pr-4 text-left align-top font-medium text-muted-foreground">
              <RunResultsSized width={columnWidths[i]}>
                {#if cell.type === 'label'}
                  {cell.text}
                {:else if cell.type === 'height'}
                  <RowToggle
                    height={headerRowHeightStore}
                    cycle={() => {
                      cycleRowHeight(headerRowHeightStore);
                    }}
                  />
                {:else if cell.type === 'var'}
                  {cell.varName}
                {:else if cell.type === 'env'}
                  <RunResultsHeader env={cell.env} height={headerRowHeightStore} />
                {/if}
                {#if i > 1}
                  <div
                    class="absolute right-0 top-2 z-10 w-4 cursor-col-resize"
                    on:pointerdown={resizeDown}
                    on:pointermove={(e) => {
                      resizeMove(e, columnWidths[i]);
                    }}
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
                  <RunResultsSummary summary={cell.summary} height={summaryRowHeightStore} />
                {:else if cell.type === 'height'}
                  <RowToggle
                    height={summaryRowHeightStore}
                    cycle={() => {
                      cycleRowHeight(summaryRowHeightStore);
                    }}
                  />
                {/if}
              </RunResultsSized>
            </td>
          {/if}
        {/each}
      </tr>
      {#each body as row}
        <tr
          class="border-b transition-colors hover:bg-muted/50"
          class:hidden={$showOnlyFailuresStore && !row.hasFailures}
        >
          {#each row.cells as cell, i}
            {#if cell.type !== 'var' || $showVarsColumnsStore}
              <td class="p-1 align-top">
                <RunResultsSized width={columnWidths[i]}>
                  {#if cell.type === 'label'}
                    {cell.text}
                  {:else if cell.type === 'height'}
                    <RowToggle
                      height={row.rowHeight}
                      cycle={() => {
                        cycleRowHeight(row.rowHeight);
                      }}
                    />
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
