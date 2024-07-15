<script lang="ts">
	import type { Prompt, Provider, Run, TestCase, TestResult } from '$lib/types';
	import { createRender, createTable, Render, Subscribe } from 'svelte-headless-table';
	import { readable, writable } from 'svelte/store';
	import * as Table from '../ui/table/';
	import RunResultsCell from './run-results-cell.svelte';
	import { addHiddenColumns } from 'svelte-headless-table/plugins';

	export let run: Run;

	interface RunRow {
		test: TestCase;
		results: TestResult[];
	}

	const data = writable<RunRow[]>([]);
	$: data.set(run.tests.map((test, index) => ({ test, results: run.results[index] })));

	let varNames = getVarNames(run.tests);
	$: varNames = getVarNames(run.tests); // Why doesn't this work by itself?

	function getVarNames(tests: TestCase[]): string[] {
		const varNames: string[] = [];
		const seen = new Set<string>();
		for (const test of tests) {
			if (!test.vars) {
				continue;
			}
			for (const key of Object.keys(test.vars)) {
				if (!seen.has(key)) {
					seen.add(key);
					varNames.push(key);
				}
			}
		}
		return varNames;
	}
	function getColumnName(env: { provider: Provider; prompt: Prompt }): string {
		if (typeof env.provider === 'string') {
			return env.provider + ' ' + env.prompt;
		}
		return env.provider.id + ' ' + env.prompt;
	}

	const table = createTable(data, {
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
		...varNames.map((varName) =>
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
				header: getColumnName(env),
				accessor: (row) => row.results[index],
				cell: ({ value }) => {
					return createRender(RunResultsCell, { testResult: value });
				}
			})
		)
	]);

	const { headerRows, pageRows, tableAttrs, tableBodyAttrs, pluginStates } =
		table.createViewModel(columns);
	const { hiddenColumnIds } = pluginStates.hideColumns;

	let showVarsColumns = true;
	$: $hiddenColumnIds = showVarsColumns ? [] : varNames;
</script>

<input id="run-{run.id}-{run.timestamp}" type="checkbox" bind:checked={showVarsColumns} />
<label for="run-{run.id}-{run.timestamp}">Show vars columns</label>
<div class="rounded-md border">
	<Table.Root {...$tableAttrs}>
		<Table.Header>
			{#each $headerRows as headerRow}
				<Subscribe rowAttrs={headerRow.attrs()}>
					<Table.Row>
						{#each headerRow.cells as cell (cell.id)}
							<Subscribe attrs={cell.attrs()} let:attrs props={cell.props()}>
								<Table.Head {...attrs}>
									<Render of={cell.render()} />
								</Table.Head>
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
