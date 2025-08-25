<script lang="ts">
  import type { Env, LiveRun } from '$lib/types';
  import RunResultsCell from './run-results-cell.svelte';
  import RunResultsHeader from './run-results-header.svelte';
  import RunResultsVar from './run-results-var.svelte';
  import RowToggle from './RowToggle.svelte';
  import {
    showVarsColumnsStore,
    showOnlyFailuresStore,
    showMetadataStore,
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
  import { selectedRunAnnotationStore } from '$lib/state/derived';
  import { resultNotesDialogStore } from '$lib/state/ui';
  import { showPrompt } from '$lib/state/actions';
  import { generateCsvContent, downloadCsv as downloadCsvFile } from '$lib/utils/csvExport';

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
    index: [number, number];
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
            index: [i, e],
            result: run.results[i][e],
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
    const annotations = $selectedRunAnnotationStore;
    const content = generateCsvContent(run, {
      includeNotes: annotations?.hasNotes ?? false,
      annotations,
    });
    downloadCsvFile(content, `eval-results-${run.id}.csv`);
  }

  let tableBodyEl: HTMLTableSectionElement | null = null;
  function isTableFocused() {
    const el = document.activeElement;
    if (el instanceof HTMLElement) {
      return el.tagName === 'TD' && el.closest('tbody') === tableBodyEl;
    }
    return false;
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!isTableFocused()) {
      return;
    }

    const el = document.activeElement as HTMLTableCellElement;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      // Get the index, and find the TD in the next row
      const index = Array.from(el.parentElement?.children ?? []).indexOf(el);
      if (index === -1) {
        return;
      }
      const nextRow = el.parentElement?.nextElementSibling as HTMLTableRowElement | undefined;
      if (nextRow) {
        const nextEl = nextRow.children[index] as HTMLTableCellElement | undefined;
        if (nextEl) {
          focusElement(nextEl);
        }
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const index = Array.from(el.parentElement?.children ?? []).indexOf(el);
      if (index === -1) {
        return;
      }
      const prevRow = el.parentElement?.previousElementSibling as HTMLTableRowElement | undefined;
      if (prevRow) {
        const prevEl = prevRow.children[index] as HTMLTableCellElement | undefined;
        if (prevEl) {
          focusElement(prevEl);
        }
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      const nextCell = el.nextElementSibling as HTMLTableCellElement | undefined;
      if (nextCell) {
        focusElement(nextCell);
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevCell = el.previousElementSibling as HTMLTableCellElement | undefined;
      if (prevCell) {
        focusElement(prevCell);
      }
    } else if (e.key === 'n') {
      // "n" key edits notes
      e.preventDefault();
      const rowElement = el.parentElement as HTMLTableRowElement | undefined;
      if (!rowElement) {
        return;
      }

      const HEADER_ROWS = 1;
      const numHiddenVarCols = $showVarsColumnsStore ? 0 : run.varNames.length;
      const colIndex = Array.from(rowElement.children).indexOf(el) + numHiddenVarCols;
      const rowIndex = Array.from(tableBodyEl?.children ?? []).indexOf(rowElement) - HEADER_ROWS;
      if (colIndex === -1 || rowIndex === -1) {
        return;
      }
      const cell = [...body[rowIndex].cells][colIndex];
      if (cell.type === 'result') {
        openNotesDialog(cell.index, () => {
          // Use 0ms setTimeout to ensure focus is set after the dialog is closed
          // Without this, the submit button steals focus back
          setTimeout(() => {
            focusElement(el);
          }, 0);
        });
      }
    }
  }

  function focusElement(el: HTMLElement) {
    if (isTableFocused()) {
      const prevEl = document.activeElement as HTMLElement | null;
      if (prevEl) {
        prevEl.setAttribute('tabindex', '-1');
      }
    }
    el.setAttribute('tabindex', '0');

    // Ensure the element is fully visible, if it can fit on the screen

    // First, find the nearest scrollable parent (should be <main>)
    let scrollableParent = el.parentElement;
    const MIN_OVERFLOW = 2; // Because the <tr> apparently has `scrollHeight == clientHeight+1`
    while (scrollableParent && !['HTML', 'BODY'].includes(scrollableParent.tagName)) {
      if (scrollableParent.scrollHeight > scrollableParent.clientHeight + MIN_OVERFLOW) {
        break;
      }
      scrollableParent = scrollableParent.parentElement;
    }
    if (scrollableParent) {
      // Get offset of el inside scrollableParent
      const rect = el.getBoundingClientRect();
      const parentRect = scrollableParent.getBoundingClientRect();

      let top = scrollableParent.scrollTop;
      let left = scrollableParent.scrollLeft;

      // Adjust horizontal scroll
      if (rect.top < parentRect.top && rect.bottom > parentRect.bottom) {
        // The element is fully visible, so do nothing
      } else if (rect.top < parentRect.top || rect.height > parentRect.height) {
        top += rect.top - parentRect.top;
      } else if (rect.bottom > parentRect.bottom) {
        top += rect.bottom - parentRect.bottom;
      }

      // Adjust vertical scroll
      if (rect.left < parentRect.left && rect.right > parentRect.right) {
        // The element is fully visible, so do nothing
      } else if (rect.left < parentRect.left || rect.width > parentRect.width) {
        left += rect.left - parentRect.left;
      } else if (rect.right > parentRect.right) {
        left += rect.right - parentRect.right;
      }

      scrollableParent.scrollTo({
        top,
        left,
      });
    }

    el.focus();
  }

  function focusable(node: HTMLElement) {
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (target.closest('button')) {
        return;
      }

      // Return early if text is selected within the node
      const selection = window.getSelection();
      if (
        selection &&
        !selection.isCollapsed &&
        node.contains(selection.anchorNode) &&
        node.contains(selection.focusNode)
      ) {
        return;
      }

      e.preventDefault();
      focusElement(node);
    }
    node.setAttribute('tabindex', '-1');
    node.addEventListener('click', onClick);
    return {
      destroy() {
        node.removeAttribute('tabindex');
        node.removeEventListener('click', onClick);
      },
    };
  }

  function openNotesDialog(index: [number, number], cb?: () => void) {
    const cellAnnotations = $selectedRunAnnotationStore?.getCellAnnotation(index);
    if (!cellAnnotations) {
      return;
    }

    const annotations = get(cellAnnotations);
    resultNotesDialogStore.set({
      index,
      notes: annotations.notes?.value ?? '',
      onSave: async (notes) => {
        const store = $selectedRunAnnotationStore;
        if (store) {
          await store.setCellNotes(index, notes);
        } else {
          await showPrompt({
            title: 'Error saving notes',
            description: ['Please refresh the page and try again.'],
          });
        }
      },
      callback: cb,
    });
  }
</script>

<svelte:window on:keydown={onKeyDown} />

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
  <div class="flex items-center gap-1.5">
    <Checkbox id="vars-run-{run.id}-{run.timestamp}-metadata" bind:checked={$showMetadataStore} />
    <Label for="vars-run-{run.id}-{run.timestamp}-metadata">Show metadata</Label>
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
    <tbody bind:this={tableBodyEl}>
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
              <td class="p-1 align-top focus:bg-muted" use:focusable>
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
                    <RunResultsCell
                      testResult={cell.result}
                      index={cell.index}
                      height={row.rowHeight}
                      on:open-notes={() => {
                        openNotesDialog(cell.index);
                      }}
                    />
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
