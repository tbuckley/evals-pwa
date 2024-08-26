<script lang="ts">
	import type { LiveResult, LiveRun, TestCase } from '$lib/types';
	import { createRender, createTable, Render, Subscribe } from 'svelte-headless-table';
	import { writable, type Readable } from 'svelte/store';
	import * as Table from '../ui/table/';
	import RunResultsCell from './run-results-cell.svelte';
	import { addHiddenColumns, addResizedColumns } from 'svelte-headless-table/plugins';
	import Label from '../ui/label/label.svelte';
	import Checkbox from '../ui/checkbox/checkbox.svelte';
	import { showVarsColumnsStore } from '$lib/state/settings';
	import GripVertical from 'lucide-svelte/icons/grip-vertical';
	import RunResultsHeader from './run-results-header.svelte';

	export let run: LiveRun;

	interface RunRow {
		test: TestCase;
		results: Readable<LiveResult>[];
	}

	const data = writable<RunRow[]>([]);
	$: data.set(run.tests.map((test, index) => ({ test, results: run.results[index] })));

	const table = createTable(data, {
		resize: addResizedColumns(),
		hideColumns: addHiddenColumns()
	});
	const columns = table.createColumns([
		table.column({
			id: 'testCase',
			header: 'Test',
			accessor: (row) => {
				return row.test;
			},
			cell: ({ value }) => {
				return value.description ?? 'Test';
			}
		}),
		...run.varNames.map((varName) =>
			table.column({
				id: varName,
				header: varName,
				accessor: (row) => {
					return row.test.vars?.[varName];
				},
				cell: ({ value }) => {
					return value ?? '-N/A-';
				}
			})
		),
		...run.envs.map((env, index) =>
			table.column({
				id: `env-${index}`,
				header: createRender(RunResultsHeader, { env }), //getColumnName(env),
				accessor: (row) => row.results[index],
				cell: ({ value }) => {
					return createRender(RunResultsCell, { testResult: value });
				},
				plugins: {
					resize: {
						initialWidth: 200
					}
				}
			})
		)
	]);

	const { headerRows, pageRows, tableAttrs, tableBodyAttrs, pluginStates } =
		table.createViewModel(columns);
	const { hiddenColumnIds } = pluginStates.hideColumns;

	$: $hiddenColumnIds = $showVarsColumnsStore ? [] : run.varNames;
	const { columnWidths } = pluginStates.resize;

	let forceResizeUpdateValue = 0;
	columnWidths.subscribe(($widths) => {
		forceResizeUpdateValue = Object.values($widths).reduce((acc, val) => acc + val, 0);
	});
</script>

<div class="mb-2 flex items-center gap-1.5">
	<Checkbox id="run-{run.id}-{run.timestamp}" bind:checked={$showVarsColumnsStore} />
	<Label for="run-{run.id}-{run.timestamp}">Show vars columns</Label>
</div>
<div class="rounded-md border">
	<Table.Root {...$tableAttrs} class="mr-[150px] w-auto">
		<Table.Header>
			{#each $headerRows as headerRow (headerRow.id)}
				<Subscribe rowAttrs={headerRow.attrs()} let:rowAttrs>
					<Table.Row {...rowAttrs}>
						{#each headerRow.cells as cell (cell.id)}
							<!-- See https://github.com/bryanmylee/svelte-headless-table/issues/139 -->
							{@const headerCellAttrs = cell.attrs()}
							{@const headerCellProps = cell.props()}
							<Subscribe attrs={headerCellAttrs} let:attrs props={headerCellProps} let:props>
								<!-- Classes copied from Table.Head -->
								<th
									class="relative h-10 px-2 pr-[16px] text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]"
									{...attrs}
									use:props.resize
								>
									<Render of={cell.render()} />

									{#if !props.resize.disabled}
										<div
											class="absolute right-0 top-1 z-10 w-4 cursor-col-resize"
											use:props.resize.drag
										>
											<GripVertical class="h-4 w-4"></GripVertical>
										</div>
									{/if}
								</th>
							</Subscribe>
						{/each}
					</Table.Row>
				</Subscribe>
			{/each}
		</Table.Header>
		<Table.Body {...$tableBodyAttrs}>
			{#each $pageRows as row (row.id)}
				<Subscribe rowAttrs={row.attrs()} let:rowAttrs>
					<Table.Row {...rowAttrs}>
						{#each row.cells as cell (cell.id)}
							<Subscribe attrs={cell.attrs()} let:attrs>
								<Table.Cell {...attrs} class="align-top">
									<Render of={cell.render()} />
								</Table.Cell>
							</Subscribe>
						{/each}
					</Table.Row>
				</Subscribe>
			{/each}
		</Table.Body>
	</Table.Root>
</div>

<!-- Necessary to force the column resizing to take effect -->
<div id="force-{forceResizeUpdateValue}"></div>
